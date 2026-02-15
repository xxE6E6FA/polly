import {
  type FileUIPart,
  type LanguageModel,
  type ModelMessage,
  generateText,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  type ReasoningUIPart,
  type TextUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { checkFreeModelUsage } from "../lib/shared_utils";
import { incrementUserMessageStats } from "../lib/conversation_utils";
import {
  convertLegacyPartToAISDK,
  type LegacyMessagePart,
} from "./message_converter";
import { performWebSearch } from "./exa";
import { shouldExtractPdfText } from "./pdf";
import {
  generateSearchNeedAssessment,
  generateSearchStrategy,
  parseSearchNeedAssessment,
  parseSearchStrategy,
} from "./search_detection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IncomingUIMessage = UIMessage<unknown, UIDataTypes, UITools> & {
  content?: unknown;
};

export type IncomingFilePart =
  | (FileUIPart & { data?: unknown; url?: string })
  | (UIMessagePart<UIDataTypes, UITools> & { mediaType?: string });

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

export function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  const reqAllowed =
    request.headers.get("access-control-request-headers") ||
    "Content-Type, Authorization";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqAllowed,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  return headers;
}

export function jsonErrorResponse(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
  extra?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ error: message, ...extra }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Message normalisation helpers
// ---------------------------------------------------------------------------

export const normalizeMessageParts = (
  message: IncomingUIMessage
): UIMessagePart<UIDataTypes, UITools>[] => {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts as UIMessagePart<UIDataTypes, UITools>[];
  }

  if (Array.isArray(message.content)) {
    return message.content as UIMessagePart<UIDataTypes, UITools>[];
  }

  return [];
};

export const extractSystemText = (
  parts: UIMessagePart<UIDataTypes, UITools>[]
): string => {
  return parts
    .filter(part => isTextUIPart(part))
    .map(part => (part as TextUIPart).text)
    .join("");
};

export const convertFilePartForModel = async (
  ctx: ActionCtx,
  part: IncomingFilePart,
  provider: string,
  modelId: string,
  modelSupportsFiles: boolean
): Promise<Record<string, unknown> | null> => {
  const filePart = part as FileUIPart & { data?: unknown; url?: string };
  const dataSource =
    typeof filePart.url === "string"
      ? filePart.url
      : (filePart as { data?: unknown }).data;

  if (dataSource === undefined || dataSource === null || dataSource === "") {
    return null;
  }

  const mediaType = "mediaType" in part ? part.mediaType : undefined;
  const filename = "filename" in filePart ? filePart.filename : undefined;

  // Handle PDF extraction for models that don't support PDF natively
  if (mediaType === "application/pdf" && typeof dataSource === "string") {
    const needsExtraction = shouldExtractPdfText(
      provider,
      modelId,
      modelSupportsFiles
    );

    if (needsExtraction) {
      try {
        // Extract the storage ID from data URL if present
        // Data URLs for PDFs stored in Convex have format: "convex://storageId"
        let storageId: string | null = null;

        if (dataSource.startsWith("convex://")) {
          storageId = dataSource.replace("convex://", "");
        }

        if (storageId) {
          // Extract PDF text using the server-side action
          const extractionResult = await ctx.runAction(
            api.ai.pdf.extractPdfText,
            {
              storageId: storageId as Id<"_storage">,
              filename: filename || "document.pdf",
            }
          );

          // Return as text part instead of file part
          return {
            type: "text",
            text: extractionResult.text,
          };
        }
      } catch (error) {
        console.error("[chatStream] PDF extraction failed:", error);
        // Fall through to return the file as-is or an error message
        return {
          type: "text",
          text: `[PDF extraction failed for ${filename || "document.pdf"}: ${error instanceof Error ? error.message : "Unknown error"}]`,
        };
      }
    }
  }

  const converted: Record<string, unknown> = {
    type: "file",
    mediaType,
    filename,
  };

  if (
    typeof dataSource === "string" ||
    dataSource instanceof Uint8Array ||
    dataSource instanceof ArrayBuffer
  ) {
    converted.data = dataSource;
  }

  return converted;
};

export const coerceUiMessageContent = async (
  ctx: ActionCtx,
  message: IncomingUIMessage,
  provider: string,
  modelId: string,
  modelSupportsFiles: boolean
): Promise<IncomingUIMessage> => {
  if (message.content !== undefined) {
    return message;
  }

  const parts = normalizeMessageParts(message);

  if (message.role === "system") {
    return {
      ...message,
      content: extractSystemText(parts),
    };
  }

  const convertedParts = await Promise.all(
    parts.map(async part => {
      if (isTextUIPart(part)) {
        return {
          type: "text",
          text: (part as TextUIPart).text,
        };
      }

      if (isReasoningUIPart(part)) {
        return {
          type: "reasoning",
          text: (part as ReasoningUIPart).text,
        };
      }

      // Handle attachment parts using unified converter
      // Supports both legacy image_url/file format AND new unified format
      const anyPart = part as Record<string, unknown>;
      if (
        anyPart.type === "image_url" ||
        anyPart.type === "file" ||
        ((anyPart.type === "image" ||
          anyPart.type === "pdf" ||
          anyPart.type === "text") &&
          anyPart.attachment)
      ) {
        return convertLegacyPartToAISDK(ctx, anyPart as LegacyMessagePart, {
          provider,
          modelId,
          supportsFiles: modelSupportsFiles,
        });
      }

      if (isFileUIPart(part)) {
        return await convertFilePartForModel(
          ctx,
          part as IncomingFilePart,
          provider,
          modelId,
          modelSupportsFiles
        );
      }

      return null;
    })
  );

  const filteredParts = convertedParts.filter(
    (part): part is Record<string, unknown> => part !== null
  );

  return {
    ...message,
    content: filteredParts,
  };
};

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

export type ResolveApiKeyResult =
  | { ok: true; apiKey: string }
  | { ok: false; response: Response };

/**
 * Resolves the API key to use for this request.
 *
 * Order of precedence:
 * 1. User-provided API key (stored encrypted in the DB)
 * 2. Environment-variable fallback per provider
 *
 * Also enforces free-model usage limits and increments message stats for
 * authenticated users.
 */
export async function resolveApiKey(
  ctx: ActionCtx,
  opts: {
    userId: Id<"users"> | null;
    cachedUser: Doc<"users"> | null;
    modelId: string;
    provider: string;
    corsHeaders: Record<string, string>;
  }
): Promise<ResolveApiKeyResult> {
  const { userId, cachedUser, modelId, provider, corsHeaders } = opts;

  try {
    let userApiKey: string | null = null;

    // Track message usage stats for authenticated users
    if (userId) {
      try {
        const model = await ctx.runQuery(api.userModels.getModelByID, {
          modelId,
          provider,
        });

        const isFreePollyModel = model?.free === true;

        // Check message limits for free/built-in models
        if (isFreePollyModel) {
          const user =
            cachedUser ||
            (await ctx.runQuery(api.users.getById, { id: userId }));
          if (user) {
            const { canSend, limit } = checkFreeModelUsage(user);
            if (!canSend) {
              const errorMessage = user.isAnonymous
                ? `You've reached your limit of ${limit} free messages. Sign in for more messages or add your own API keys.`
                : `You've reached your monthly limit of ${limit} free messages. Add your own API keys for unlimited usage.`;
              return {
                ok: false,
                response: jsonErrorResponse(errorMessage, 429, corsHeaders),
              };
            }
          }
        }

        // Increment user message stats
        await incrementUserMessageStats(
          ctx,
          userId,
          modelId,
          provider,
          undefined,
          { countTowardsMonthly: isFreePollyModel }
        );
      } catch (error) {
        console.warn(
          "[chatStream] Failed to increment message stats:",
          error
        );
      }
    }

    if (userId) {
      try {
        userApiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
          provider:
            provider as
              | "openai"
              | "anthropic"
              | "google"
              | "openrouter"
              | "groq"
              | "moonshot"
              | "replicate"
              | "elevenlabs",
          modelId,
        });
      } catch (error) {
        console.warn("[chatStream] Failed to get user API key:", error);
      }
    }

    if (userApiKey) {
      return { ok: true, apiKey: userApiKey };
    }

    // Fallback to environment variables
    let envKeyName: string | null = null;
    switch (provider) {
      case "openai":
        envKeyName = "OPENAI_API_KEY";
        break;
      case "anthropic":
        envKeyName = "ANTHROPIC_API_KEY";
        break;
      case "google":
        envKeyName = "GEMINI_API_KEY";
        break;
      case "openrouter":
        envKeyName = "OPENROUTER_API_KEY";
        break;
      default:
        envKeyName = null;
        break;
    }

    if (!envKeyName) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const envKey = process.env[envKeyName];

    if (!envKey) {
      const _availableKeys = Object.keys(process.env).filter(
        key =>
          key.includes("API_KEY") ||
          key.includes("OPENROUTER") ||
          key.includes("GEMINI") ||
          key.includes("ANTHROPIC") ||
          key.includes("OPENAI")
      );

      throw new Error(
        `No API key found for ${provider}. Please add an API key in Settings or configure ${envKeyName} environment variable.`
      );
    }

    return { ok: true, apiKey: envKey };
  } catch (apiKeyError) {
    console.error("Failed to get API key:", apiKeyError);
    return {
      ok: false,
      response: jsonErrorResponse(
        apiKeyError instanceof Error
          ? apiKeyError.message
          : `No API key found for provider: ${provider}`,
        401,
        corsHeaders
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Search pre-check fallback (for models without native tool support)
// ---------------------------------------------------------------------------

/**
 * For models that don't support tool calling, runs a lightweight LLM
 * assessment to decide whether a web search is needed, performs the search
 * via Exa, and injects the results as a system message.
 *
 * Returns the (possibly augmented) message array.
 */
export async function maybeInjectSearchContext(
  languageModel: LanguageModel,
  exaApiKey: string,
  processedMessages: ModelMessage[]
): Promise<ModelMessage[]> {
  try {
    const lastUserMessage = processedMessages
      .filter(m => m.role === "user")
      .pop();
    const userQuery =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content
        : "";

    if (!userQuery) {
      return processedMessages;
    }

    // Step 1: Check if search is needed using a fast LLM call
    const assessmentPrompt = generateSearchNeedAssessment({ userQuery });
    const assessmentResult = await generateText({
      model: languageModel,
      messages: [{ role: "user", content: assessmentPrompt }],
      maxOutputTokens: 10,
    });

    const assessment = parseSearchNeedAssessment(assessmentResult.text);

    if (assessment.canAnswerConfidently) {
      return processedMessages;
    }

    // Step 2: Determine search strategy
    const strategyPrompt = generateSearchStrategy({ userQuery });
    const strategyResult = await generateText({
      model: languageModel,
      messages: [{ role: "user", content: strategyPrompt }],
      maxOutputTokens: 200,
    });

    const strategy = parseSearchStrategy(strategyResult.text, userQuery);

    // Step 3: Perform search
    const searchResult = await performWebSearch(exaApiKey, {
      query: strategy.suggestedQuery || userQuery,
      searchType: strategy.searchType,
      searchMode: strategy.searchMode,
      category: strategy.category,
      maxResults: strategy.suggestedSources || 8,
    });

    // Step 4: Inject search context into the conversation
    if (!searchResult.context || !searchResult.sources?.length) {
      return processedMessages;
    }

    const numberedSources = searchResult.sources
      .slice(0, 8)
      .map((source, i) => {
        const domain = source.url
          ? new URL(source.url).hostname.replace(/^www\./, "")
          : "";
        const title = source.title || domain;
        const snippet = source.snippet?.substring(0, 300) || "";
        return `[${i + 1}] ${title} (${domain})\n${snippet}`;
      })
      .join("\n\n");

    const searchContextMessage: ModelMessage = {
      role: "system",
      content: `Web search results:\n\n${numberedSources}\n\n---\nIMPORTANT: You MUST cite these sources in your response using [1], [2], etc.\nPlace citations after punctuation: "The empire fell in 476 AD.[1]"`,
    };

    // Insert search context after the system message
    const systemMsgIndex = processedMessages.findIndex(
      m => m.role === "system"
    );
    const finalMessages = [...processedMessages];
    if (systemMsgIndex !== -1) {
      finalMessages.splice(systemMsgIndex + 1, 0, searchContextMessage);
    } else {
      finalMessages.unshift(searchContextMessage);
    }

    return finalMessages;
  } catch (searchError) {
    console.warn(
      "[chatStream] Search pre-check failed, continuing without search:",
      searchError
    );
    return processedMessages;
  }
}
