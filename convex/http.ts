import { getAuthUserId } from "@convex-dev/auth/server";
import { generateText, smoothStream, streamText } from "ai";
import { httpRouter } from "convex/server";
import type { Prediction } from "replicate";
import { api, internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { httpAction } from "./_generated/server";
import { CONFIG } from "./ai/config.js";
import { streamTTS } from "./ai/elevenlabs.js";
import { getApiKey } from "./ai/encryption.js";
import { getUserFriendlyErrorMessage } from "./ai/error_handlers.js";
import { performWebSearch } from "./ai/exa.js";
import { convertMessages } from "./ai/messages.js";
import { shouldExtractPdfText } from "./ai/pdf.js";
import {
  generateSearchNeedAssessment,
  generateSearchStrategy,
  parseSearchNeedAssessment,
  parseSearchStrategy,
} from "./ai/search_detection.js";
import {
  createLanguageModel,
  getProviderStreamOptions,
} from "./ai/server_streaming.js";
import { processUrlsInMessage } from "./ai/url_processing.js";
import { auth } from "./auth.js";
import { chatStream } from "./chat.js";
import { getBaselineInstructions } from "./constants.js";
import {
  getPersonaPrompt,
  mergeSystemPrompts,
} from "./lib/conversation/message_handling.js";
import { log } from "./lib/logger.js";
import { processAttachmentsForLLM } from "./lib/process_attachments.js";
import { humanizeReasoningText } from "./lib/shared/stream_utils.js";

// (api, internal) already imported above

const http = httpRouter();

// Simple in-memory rate limiter (per user per minute)
const RATE = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_PER_MINUTE = 20;

function rateLimitCheck(userId: string): boolean {
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000; // current minute
  const entry = RATE.get(userId);
  if (!entry || entry.windowStart !== windowStart) {
    RATE.set(userId, { count: 1, windowStart });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }
  entry.count++;
  return true;
}

auth.addHttpRoutes(http);

// Add chat streaming endpoint for AI SDK
http.route({
  path: "/chat",
  method: "POST",
  handler: chatStream,
});

// Add OPTIONS support for CORS preflight (handled inside chatStream with relaxed CORS)
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: chatStream,
});

// ElevenLabs low-latency streaming proxy
http.route({
  path: "/tts/stream",
  method: "GET",
  handler: streamTTS,
});
http.route({
  path: "/tts/stream",
  method: "OPTIONS",
  handler: streamTTS,
});

// Removed LLM→TTS WebSocket pipeline in favor of server HTTP streaming

// Replicate webhook handler following API specification
const replicateWebhook = httpAction(async (ctx, request): Promise<Response> => {
  try {
    const rawBody = await request.text();

    // Validate request has a body
    if (!rawBody) {
      log.warn("Received empty webhook body");
      return new Response("Bad Request", { status: 400 });
    }

    let body: Partial<Prediction> & {
      id?: string;
      status?: string;
    };
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      log.warn("Invalid JSON in webhook body", { parseError });
      return new Response("Bad Request", { status: 400 });
    }

    // Validate required fields per API spec
    if (!body.id) {
      log.warn("Webhook missing prediction ID");
      return new Response("Bad Request", { status: 400 });
    }

    if (!body.status) {
      log.warn("Webhook missing status", { predictionId: body.id });
      return new Response("Bad Request", { status: 400 });
    }

    // Verify webhook signature for security (recommended in production)
    const signature = request.headers.get("replicate-signature");
    if (signature) {
      log.debug("Received signed webhook", {
        predictionId: body.id,
        hasSecret: !!process.env.REPLICATE_WEBHOOK_SECRET,
      });
      // Note: Full signature verification would require crypto module
      // This is a security enhancement for production environments
    }

    // Validate status is a known value
    const validStatuses: Prediction["status"][] = [
      "starting",
      "processing",
      "succeeded",
      "failed",
      "canceled",
    ];
    if (!validStatuses.includes(body.status as Prediction["status"])) {
      log.warn("Unknown webhook status", {
        predictionId: body.id,
        status: body.status,
      });
      return new Response("Bad Request", { status: 400 });
    }

    // Process the webhook
    await ctx.runAction(internal.ai.replicate.handleWebhook, {
      predictionId: body.id || "",
      status: body.status || "unknown",
      output: body.output,
      error: typeof body.error === "string" ? body.error : undefined,
      metadata: body.metrics,
    });

    log.info("Successfully processed webhook", {
      predictionId: body.id,
      status: body.status,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    log.error("Webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Internal Server Error", { status: 500 });
  }
});

http.route({
  path: "/webhooks/replicate",
  method: "POST",
  handler: replicateWebhook,
});

// Add OPTIONS support for Replicate webhook CORS
http.route({
  path: "/webhooks/replicate",
  method: "OPTIONS",
  handler: httpAction(() => {
    return Promise.resolve(
      new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Replicate-Signature",
        },
      })
    );
  }),
});

export default http;

// Optimistic author streaming with batched DB writes
http.route({
  path: "/conversation/stream",
  method: "POST",
  handler: httpAction(async (ctx, request): Promise<Response> => {
    // Relaxed CORS: reflect Origin and allow credentials for cookie-based auth
    const origin = request.headers.get("origin") || "*";
    const reqAllowed =
      request.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization";
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": reqAllowed,
      "Access-Control-Allow-Credentials": "true",
    };
    cors["Vary"] = "Origin";

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    try {
      const body = await request.json();
      const {
        conversationId,
        messageId,
        modelId: reqModelId,
        provider: reqProvider,
        personaId,
        reasoningConfig,
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        presencePenalty,
      } = body || {};

      if (!(conversationId && messageId)) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }

      // AuthN: require user
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Rate limit per user
      if (!rateLimitCheck(userId)) {
        return new Response(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // AuthZ: ensure user owns the conversation and message
      const [conversation, message] = await Promise.all([
        ctx.runQuery(api.conversations.get, { id: conversationId }),
        ctx.runQuery(api.messages.getById, { id: messageId }),
      ]);
      if (!conversation || conversation.userId !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!message || message.conversationId !== conversationId) {
        return new Response(JSON.stringify({ error: "Invalid message" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Prioritize request parameters over message parameters for retry scenarios
      // When retrying with a different model, the request will have the new model/provider
      const modelId = reqModelId || (message?.model as string | undefined);
      const provider = (reqProvider ||
        (message?.provider as string | undefined)) as
        | "openai"
        | "anthropic"
        | "google"
        | "openrouter"
        | undefined;

      if (!(modelId && provider)) {
        return new Response(
          JSON.stringify({ error: "Model/provider missing" }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }
      // Update message with current model/provider to ensure consistency
      // This handles race conditions where HTTP stream starts before retryFromMessage DB updates complete
      // Also ensures reasoning is properly cleared for retry scenarios
      if (reqModelId || reqProvider) {
        try {
          await ctx.runMutation(internal.messages.internalUpdate, {
            id: messageId,
            model: modelId,
            provider: provider as
              | "openai"
              | "anthropic"
              | "google"
              | "groq"
              | "openrouter"
              | "replicate"
              | "elevenlabs",
            reasoning: "", // Clear reasoning for retry by setting to empty string
          });
        } catch {
          // Ignore update failures
        }
      }

      // Ensure conversation reflects active streaming state for consistent UI ordering
      try {
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: conversationId,
          updates: { isStreaming: true },
          setUpdatedAt: true,
        });
      } catch {
        // Ignore: best-effort update
      }

      // Create stream to the browser
      const ts = new TransformStream();
      const writer = ts.writable.getWriter();
      const encoder = new TextEncoder();

      const writeFrame = async (obj: unknown) => {
        try {
          await writer.write(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          // Ignore write errors during streaming
        }
      };

      // Return response immediately so client can start reading the stream
      const streamHeaders: Record<string, string> = {
        ...cors,
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Transfer-Encoding": "chunked",
      };
      streamHeaders["Connection"] = "keep-alive";
      // Include CORS headers on the streaming response for credentialed requests
      const originHdr = request.headers.get("origin") || "";
      if (originHdr) {
        (streamHeaders as Record<string, string>)[
          "Access-Control-Allow-Origin"
        ] = originHdr;
        (streamHeaders as Record<string, string>)[
          "Access-Control-Allow-Credentials"
        ] = "true";
        (streamHeaders as Record<string, string>)["Vary"] = "Origin";
      }
      const response = new Response(ts.readable, { headers: streamHeaders });

      // Prefetch all Convex data needed before returning the Response
      const all = await ctx.runQuery(api.messages.getAllInConversation, {
        conversationId,
      });

      // Persona prompt used to build system message
      const personaPrompt = await getPersonaPrompt(
        ctx,
        personaId ?? conversation.personaId
      );

      // Model capabilities for PDF handling
      const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
        modelId,
        provider,
      });

      // Prepare model + provider options up-front (no ctx.* after returning)
      const apiKey = await getApiKey(ctx, provider, modelId, conversationId);
      const model = await createLanguageModel(ctx, provider, modelId, apiKey);
      const streamOpts = await getProviderStreamOptions(
        ctx,
        provider,
        modelId,
        reasoningConfig?.enabled
          ? {
              effort: reasoningConfig.effort,
              maxTokens: reasoningConfig.maxTokens,
            }
          : undefined,
        undefined
      );

      // Optional lightweight detect model for web search precheck/strategy
      const detectKey = await getApiKey(
        ctx,
        "google",
        "gemini-2.5-flash-lite",
        conversationId
      );
      const detectModel = detectKey
        ? await createLanguageModel(
            ctx,
            "google",
            "gemini-2.5-flash-lite",
            detectKey
          )
        : null;

      // Start all processing in background - don't block the response
      (async () => {
        // Build context messages (simplified, preserves system + conversation)
        const baseline = getBaselineInstructions(modelId);
        const system = mergeSystemPrompts(baseline, personaPrompt);

        // Watchdog: if conversation shows isStreaming=true but there is no active thinking/streaming message,
        // clear the flag (stale state from a prior crash) before we begin.
        // Avoid DB writes here; stale flags will be corrected by finish handler

        // Build stream messages with attachment processing for the last user message
        const streamMsgs: Array<{
          role: "user" | "assistant" | "system";
          content: string | Record<string, unknown>[];
        }> = [];

        streamMsgs.push({ role: "system", content: system });

        // Copy messages and handle attachments on the last user item
        let lastUserIdx = -1;
        for (let i = 0; i < all.length; i++) {
          const m: Doc<"messages"> = all[i];
          if (m.role === "user") {
            lastUserIdx = i;
          }
        }

        let lastUserAttachments: Doc<"messages">["attachments"];
        for (let i = 0; i < all.length; i++) {
          const m: Doc<"messages"> = all[i];
          if (m.role !== "user" && m.role !== "assistant") {
            continue;
          }

          // Skip assistant messages with empty content (they're the message being generated)
          if (m.role === "assistant" && (!m.content || m.content === "")) {
            continue;
          }

          // Default to string content
          let content: string | Record<string, unknown>[] =
            typeof m.content === "string" ? m.content : [];

          if (
            i === lastUserIdx &&
            Array.isArray(m.attachments) &&
            m.attachments.length > 0
          ) {
            // If PDFs present and extraction is needed, notify client about reading status
            const hasPdf = m.attachments.some(a => a.type === "pdf");
            const needsExtraction =
              hasPdf &&
              shouldExtractPdfText(
                provider,
                modelId,
                Boolean(modelInfo?.supportsFiles)
              );
            if (needsExtraction) {
              await writeFrame({ t: "status", status: "reading_pdf" });
            }
            // Process attachments for LLM consumption (PDF extraction, etc.)
            const processed = await processAttachmentsForLLM(
              ctx,
              m.attachments,
              provider,
              modelId,
              Boolean(modelInfo?.supportsFiles),
              messageId
            );
            lastUserAttachments = processed;

            const parts: Record<string, unknown>[] = [];
            if (typeof content === "string" && content.trim().length > 0) {
              parts.push({ type: "text", text: content });
            }
            for (const att of processed || []) {
              if (att.type === "image") {
                const imgPart: Record<string, unknown> = {
                  type: "image_url",
                  attachment: att,
                };
                (imgPart as Record<string, unknown>)["image_url"] = {
                  url: att.url,
                };
                parts.push(imgPart);
              } else if (att.type === "pdf") {
                if (att.content) {
                  const filePart: Record<string, unknown> = {
                    type: "file",
                    file: { filename: att.name } as Record<string, unknown>,
                    attachment: att,
                  };
                  (filePart.file as Record<string, unknown>)["file_data"] =
                    att.content;
                  parts.push(filePart);
                } else {
                  // Fallback to text-only placeholder
                  parts.push({ type: "text", text: `File: ${att.name}` });
                }
              } else if (att.type === "text") {
                parts.push({ type: "text", text: att.content || "" });
              }
            }
            content = parts;
            // After attachment processing finished, reflect status back to thinking for UI
            await writeFrame({ t: "status", status: "thinking" });
          }

          streamMsgs.push({ role: m.role, content });
        }

        // Web search pre-check + EXA search (blocking path before LLM)
        try {
          const exaApiKey = process.env.EXA_API_KEY;
          // Extract latest user text message
          const userMessages = all.filter(
            (m: Doc<"messages">) => m.role === "user"
          );
          const latestUser = userMessages[userMessages.length - 1];
          const latestText =
            latestUser && typeof latestUser.content === "string"
              ? (latestUser.content as string)
              : "";

          // Quick heuristic (mirrors action version)
          const quickHeuristicShouldSearch = (text: string): boolean => {
            const q = text.toLowerCase();
            if (/(https?:\/\/|www\.)\S+/.test(q)) {
              return true;
            }
            const recency = [
              "latest",
              "current",
              "today",
              "this week",
              "this month",
              "recent",
              "breaking",
              "news",
              "update",
              "changelog",
            ];
            if (recency.some(w => q.includes(w))) {
              return true;
            }
            const patterns = [
              /price|stock|ticker|earnings|revenue|guidance|ceo|cfo|hiring|fired|acquired|valuation/,
              /version\s*(\d+|latest)|released?|release date|announce|announced|launch/,
              /who\s+is\s+the\s+(ceo|president|head|lead)\b/,
            ];
            if (patterns.some(re => re.test(q))) {
              return true;
            }
            const months = [
              "january",
              "february",
              "march",
              "april",
              "may",
              "june",
              "july",
              "august",
              "september",
              "october",
              "november",
              "december",
            ];
            if (months.some(m => q.includes(m))) {
              return true;
            }
            const year = new Date().getFullYear();
            if (q.includes(String(year)) || q.includes(String(year - 1))) {
              return true;
            }
            return false;
          };

          // Small timeout helper
          const withTimeout = async <T>(
            p: Promise<T>,
            ms: number,
            label = "op"
          ): Promise<T> => {
            return await Promise.race([
              p,
              new Promise<T>((_, rej) =>
                setTimeout(
                  () => rej(new Error(`${label} timeout after ${ms}ms`)),
                  ms
                )
              ) as Promise<T>,
            ]);
          };

          if (exaApiKey && latestText) {
            // Step 1: pre-check
            let shouldSearch = quickHeuristicShouldSearch(latestText);
            if (!shouldSearch) {
              try {
                const searchContext = {
                  userQuery: latestText,
                  conversationHistory: all
                    .slice(-5)
                    .filter((m: Doc<"messages">) => m.role !== "system")
                    .map((m: Doc<"messages">) => ({
                      role: m.role as "user" | "assistant",
                      content:
                        typeof m.content === "string"
                          ? (m.content as string)
                          : "[multimodal]",
                      hasSearchResults: false,
                    })),
                };
                const precheckPrompt =
                  generateSearchNeedAssessment(searchContext);
                // Use pre-created detectModel if available
                const precheckBudget = Number(
                  CONFIG.PERF?.PRECHECK_BUDGET_MS ?? 350
                );
                const need = detectModel
                  ? await withTimeout(
                      generateText({
                        model: detectModel,
                        prompt: precheckPrompt,
                        temperature: 0,
                      }),
                      precheckBudget,
                      "precheck"
                    )
                  : { text: "skip" };
                const parsed = parseSearchNeedAssessment(need.text);
                shouldSearch = !parsed.canAnswerConfidently;
              } catch {
                // If precheck fails, default to not searching (conservative)
                shouldSearch = false;
              }
            }

            // Step 2: strategy + EXA search
            if (shouldSearch) {
              try {
                await writeFrame({ t: "status", status: "searching" });

                // Decide strategy (best-effort)
                let decision: ReturnType<typeof parseSearchStrategy> = {
                  shouldSearch: true,
                  searchType: "search",
                  reasoning: "fallback",
                  confidence: 0.8,
                  suggestedSources: 8,
                  suggestedQuery: latestText,
                };
                try {
                  const strategyPrompt = generateSearchStrategy({
                    userQuery: latestText,
                  });
                  const strategyBudget = Math.max(
                    200,
                    Math.floor(
                      Number(CONFIG.PERF?.PRECHECK_BUDGET_MS ?? 350) * 0.75
                    )
                  );
                  if (detectModel) {
                    const resp = await withTimeout(
                      generateText({
                        model: detectModel,
                        prompt: strategyPrompt,
                        temperature: 0,
                      }),
                      strategyBudget,
                      "strategy"
                    );
                    decision = parseSearchStrategy(resp.text, latestText);
                  }
                } catch {
                  // Keep fallback decision
                }

                await writeFrame({
                  t: "tool_call",
                  name: "exa.search",
                  args: {
                    query: decision.suggestedQuery || latestText,
                    searchType: decision.searchType,
                    searchMode: decision.searchMode,
                    maxResults: Number(CONFIG.PERF?.EXA_FULL_TOPK ?? 6),
                  },
                });

                const result = await performWebSearch(exaApiKey, {
                  query: decision.suggestedQuery || latestText,
                  searchType: decision.searchType,
                  searchMode: decision.searchMode,
                  category: decision.category,
                  maxResults: Number(CONFIG.PERF?.EXA_FULL_TOPK ?? 6),
                });

                // Attach citations + metadata for UI
                await ctx.runMutation(
                  internal.messages.updateAssistantContent,
                  {
                    messageId,
                    citations: result.citations,
                    metadata: {
                      searchQuery: decision.suggestedQuery || latestText,
                      searchFeature: decision.searchType,
                      searchCategory: decision.category,
                      searchMode: decision.searchMode,
                    },
                  }
                );
                await writeFrame({
                  t: "citations",
                  citations: result.citations,
                });
                await writeFrame({
                  t: "tool_result",
                  name: "exa.search",
                  ok: true,
                  count: (result.citations || []).length,
                });

                // Step 3: inject as system context before messages -> LLM
                const searchResultsMessage = {
                  role: "system" as const,
                  content: `🚨 CRITICAL CITATION REQUIREMENTS 🚨\n\nBased on the user's query, I have searched the web and found relevant information. You MUST cite sources for any information derived from these search results.\n\nSEARCH RESULTS:\n${result.context}\n\nAVAILABLE SOURCES FOR CITATION:\n${result.citations
                    .map((c, idx) => `[${idx + 1}] ${c.title} - ${c.url}`)
                    .join(
                      "\n"
                    )}\n\nWhen using information from these search results, you MUST include citations in the format [1], [2], etc. corresponding to the source numbers above.`,
                };
                // Insert after the first system message
                streamMsgs.splice(1, 0, searchResultsMessage);

                // Switch back to thinking before LLM stream starts (client-only)
                await writeFrame({ t: "status", status: "thinking" });
              } catch (_e) {
                // If search fails, continue without search
                await writeFrame({
                  t: "tool_result",
                  name: "exa.search",
                  ok: false,
                });
              }
            }
          }
        } catch (_e) {
          // Non-fatal: continue without web search
        }

        // URL processing for any links in the latest user message (before LLM)
        try {
          const exaApiKey = process.env.EXA_API_KEY;
          const userMessages = all.filter(
            (m: Doc<"messages">) => m.role === "user"
          );
          const latestUser = userMessages[userMessages.length - 1];
          const latestText =
            latestUser && typeof latestUser.content === "string"
              ? (latestUser.content as string)
              : "";
          if (exaApiKey && latestText) {
            const urlResult = await processUrlsInMessage(exaApiKey, latestText);
            if (urlResult && urlResult.contents.length > 0) {
              await writeFrame({ t: "status", status: "reading_pdf" });

              const urlContextMessage = {
                role: "system" as const,
                content: `I have access to content from the links you shared:\n\n${urlResult.contents
                  .map(
                    content =>
                      `**${content.title}** (${content.url})\n${content.summary}`
                  )
                  .join(
                    "\n\n"
                  )}\n\nI can reference this content naturally in our conversation without formal citations. Feel free to ask me about anything from these sources or share more links!`,
              };
              // Insert after first system message
              streamMsgs.splice(1, 0, urlContextMessage);
            }
          }
        } catch (_error) {
          // Continue without URL processing
        } finally {
          // Reflect status to client only; avoid DB writes during stream
          await writeFrame({ t: "status", status: "thinking" });
        }

        // Convert to AI SDK CoreMessage format
        const context = await convertMessages(ctx, streamMsgs, provider);

        // Send init frame to client
        const personaInit = personaId ?? conversation.personaId;
        await writeFrame({
          t: "init",
          assistantMessageId: messageId,
          model: modelId,
          provider,
          personaId: personaInit,
          attachments: Array.isArray(lastUserAttachments)
            ? lastUserAttachments.map(a => ({
                type: a.type,
                name: a.name,
                size: a.size,
              }))
            : [],
        });

        // Content accumulation (DB writes deferred until end)
        let pending = "";
        let fullContent = "";
        let lastFlush = Date.now();
        const FLUSH_MS = 250;
        const hasDelimiter = (s: string) =>
          /[\n.!?]|(\s{2,})/.test(s) || s.length > 100;

        const flush = () => {
          if (!pending) {
            return;
          }
          const toSend = pending;
          pending = "";
          fullContent += toSend;
        };

        // Reasoning batching (incremental thinking traces)
        let reasoningPending = "";
        let reasoningFull = "";
        let reasoningTail = ""; // dedupe tail to avoid duplicate tokens
        let lastReasoningFlush = Date.now();
        const REASONING_FLUSH_MS = 250;
        const REASONING_MIN_CHARS = 24;
        const REASONING_TAIL_MAX = 80;
        let reasoningStartMs: number | null = null;
        const dedupeDelta = (tail: string, delta: string) => {
          if (!delta) {
            return "";
          }
          // Sanitize provider-specific markers
          const d = humanizeReasoningText(delta);
          if (!d) {
            return "";
          }
          const maxOverlap = Math.min(tail.length, d.length);
          let overlap = 0;
          for (let k = maxOverlap; k >= 1; k--) {
            if (tail.slice(-k) === d.slice(0, k)) {
              overlap = k;
              break;
            }
          }
          return d.slice(overlap);
        };
        const flushReasoning = () => {
          if (!reasoningPending) {
            return;
          }
          const toSend = reasoningPending;
          reasoningPending = "";
          reasoningFull += toSend;
        };

        // Kick off LLM stream
        (async () => {
          try {
            const result = streamText({
              model,
              messages: context,
              temperature,
              topP,
              frequencyPenalty,
              presencePenalty,
              ...(maxTokens && maxTokens > 0 ? { maxTokens } : {}),
              ...streamOpts,
              // biome-ignore lint/style/useNamingConvention: AI SDK option
              experimental_transform: smoothStream({
                delayInMs: 8,
                chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/, // CJK-aware
              }),
              onChunk: async ({ chunk }) => {
                // Stream reasoning deltas to DB so UI can render traces live (v5 uses "reasoning-delta" type)
                if (chunk.type === "reasoning-delta" && chunk.text) {
                  const delta = dedupeDelta(reasoningTail, chunk.text);
                  if (delta) {
                    if (reasoningStartMs === null) {
                      reasoningStartMs = Date.now();
                    }
                    reasoningPending += delta;
                    // Update tail
                    reasoningTail = (reasoningTail + delta).slice(
                      -REASONING_TAIL_MAX
                    );
                    // Stream reasoning delta as NDJSON line: {"t":"reasoning","d":"..."}\n
                    await writeFrame({ t: "reasoning", d: delta });
                  }
                  const now = Date.now();
                  if (
                    reasoningPending.length >= REASONING_MIN_CHARS ||
                    now - lastReasoningFlush > REASONING_FLUSH_MS
                  ) {
                    flushReasoning();
                    lastReasoningFlush = now;
                  }
                }
              },
            });

            // Mark as streaming once the request is in flight
            await writeFrame({ t: "status", status: "streaming" });

            for await (const chunk of result.textStream) {
              pending += chunk;
              // Stream content delta to author as NDJSON line: {"t":"content","d":"..."}\n
              await writeFrame({ t: "content", d: chunk });

              const now = Date.now();
              if (hasDelimiter(chunk) || now - lastFlush > FLUSH_MS) {
                flush();
                lastFlush = now;
              }
            }

            // Check result for errors even if stream completed
            const finishReason = await result.finishReason;
            if (finishReason === "error" || finishReason === "other") {
              throw new Error("Stream completed with error finish reason");
            }

            // Final flush and finalize
            flush();
            flushReasoning();
            const metadata: {
              finishReason?: string;
              thinkingDurationMs?: number;
            } = { finishReason: "stop" };
            if (reasoningStartMs !== null) {
              metadata.thinkingDurationMs = Date.now() - reasoningStartMs;
            }
            // Defer DB finalization to a scheduled mutation to avoid dangling ops
            try {
              await ctx.scheduler.runAfter(0, internal.messages.updateContent, {
                messageId,
                content: fullContent,
                reasoning: reasoningFull || undefined,
                finishReason: "stop",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              });
              await ctx.scheduler.runAfter(
                0,
                internal.messages.internalUpdate,
                {
                  id: messageId,
                  metadata,
                }
              );
              await ctx.scheduler.runAfter(
                0,
                internal.messages.updateMessageStatus,
                {
                  messageId,
                  status: "done",
                }
              );
              await ctx.scheduler.runAfter(
                0,
                internal.conversations.internalPatch,
                {
                  id: conversationId,
                  updates: { isStreaming: false },
                }
              );
            } catch {
              // ignore scheduling failures
            }

            // Inform client of finish
            await writeFrame({ t: "finish", reason: "stop" });
            await writer.close();
          } catch (error: unknown) {
            log.error("Stream error:", error);
            // Schedule error finalization updates
            try {
              const friendlyError = getUserFriendlyErrorMessage(error);
              await ctx.scheduler.runAfter(
                0,
                internal.messages.updateMessageError,
                {
                  messageId,
                  error: friendlyError,
                }
              );
              await ctx.scheduler.runAfter(
                0,
                internal.conversations.internalPatch,
                {
                  id: conversationId,
                  updates: { isStreaming: false },
                }
              );
              // Send error event to client before finish event
              await writeFrame({ t: "error", error: friendlyError });
            } catch {
              // ignore scheduling failures
            }
            // Inform client of finish (error)
            await writeFrame({ t: "finish", reason: "error" });
            try {
              await writer.close();
            } catch {
              // Ignore errors when closing writer
            }
          }
        })();
      })(); // End of main processing async function

      // Removed deferred EXA/URL processing; we run pre-check + search + URL processing before LLM

      return response;
    } catch (_e) {
      const origin = request.headers.get("origin") || "*";
      const reqAllowed =
        request.headers.get("access-control-request-headers") ||
        "Content-Type, Authorization";
      return new Response(JSON.stringify({ error: "Bad Request" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": reqAllowed,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }
  }),
});

http.route({
  path: "/conversation/stream",
  method: "OPTIONS",
  handler: httpAction((_ctx, request) => {
    const origin = request.headers.get("origin") || "";
    const reqAllowed =
      request.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization";
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": reqAllowed,
      "Access-Control-Max-Age": "86400",
    };
    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
      headers["Vary"] = "Origin";
    } else {
      // Fallback for non-browser callers
      headers["Access-Control-Allow-Origin"] = "*";
    }
    return Promise.resolve(
      new Response(null, {
        status: 200,
        headers,
      })
    );
  }),
});
