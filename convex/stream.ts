import { getAuthUserId } from "@convex-dev/auth/server";
import {
  DEFAULT_POLLY_MODEL_ID,
  mapPollyModelToProvider,
  WEB_SEARCH_MAX_RESULTS,
} from "@shared/constants";
import { generateText, streamText } from "ai";
import { v } from "convex/values";
import dedent from "dedent";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { AnthropicNativeHandler } from "./ai/anthropic_native";
import { getApiKey } from "./ai/encryption";
import { getUserFriendlyErrorMessage } from "./ai/errors";
import { extractSearchContext, getExaApiKey, performWebSearch } from "./ai/exa";
import { convertMessages } from "./ai/messages";
import { createLanguageModel, getProviderStreamOptions } from "./ai/providers";
import { isReasoningModel } from "./ai/reasoning_detection";
import { ResourceManager } from "./ai/resource_manager";
import {
  generateSearchNeedAssessment,
  generateSearchStrategy,
  parseSearchNeedAssessment,
  parseSearchStrategy,
  type SearchDecision,
  type SearchDecisionContext,
  type SearchNeedAssessment,
} from "./ai/search_detection";
import { StreamInterruptor } from "./ai/stream_interruptor";
import { buildContextMessages } from "./lib/conversation_utils";
import {
  contextMessageSchema,
  reasoningConfigForActionSchema,
} from "./lib/schemas";
import type { Citation, ProviderType, StreamMessage } from "./types";

// --- Optimized StreamHandler ---
// This version batches database writes to reduce load.

export class StreamHandler {
  // biome-ignore lint/suspicious/noExplicitAny: ActionCtx type from Convex
  private ctx: any;
  private messageId: Id<"messages">;
  private contentBuffer = "";
  private reasoningBuffer = "";
  private lastUpdateTime = 0;
  private readonly updateInterval = 300; // ms
  private abortController: AbortController | null = null;
  private finishData: {
    text: string;
    finishReason: string;
    // biome-ignore lint/suspicious/noExplicitAny: Reasoning can have various shapes
    reasoning?: any;
    // biome-ignore lint/suspicious/noExplicitAny: Provider metadata varies by provider
    providerMetadata?: any;
  } | null = null;

  // biome-ignore lint/suspicious/noExplicitAny: ActionCtx type from Convex
  constructor(ctx: any, messageId: Id<"messages">) {
    this.ctx = ctx;
    this.messageId = messageId;
  }

  get messageIdValue(): Id<"messages"> {
    return this.messageId;
  }

  public setAbortController(controller: AbortController) {
    this.abortController = controller;
  }

  public async appendToBuffer(text: string) {
    this.contentBuffer += text;
    await this.flushBuffers();
  }

  public async checkIfStopped(): Promise<boolean> {
    const message = await this.ctx.runQuery(api.messages.getById, {
      id: this.messageId,
    });
    return message?.metadata?.stopped === true;
  }

  public setFinishData(data: typeof this.finishData) {
    this.finishData = data;
  }

  private async flushBuffers(force = false) {
    const now = Date.now();
    if (
      !force &&
      now - this.lastUpdateTime < this.updateInterval &&
      this.contentBuffer.length > 0 &&
      !/[\n.!?]/.test(this.contentBuffer)
    ) {
      return;
    }

    if (this.contentBuffer.length > 0 || this.reasoningBuffer.length > 0) {
      const contentToAppend = this.contentBuffer;
      const reasoningToAppend = this.reasoningBuffer;
      this.contentBuffer = "";
      this.reasoningBuffer = "";
      this.lastUpdateTime = now;

      await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: this.messageId,
        appendContent: contentToAppend,
        appendReasoning: reasoningToAppend,
      });
    }
  }

  public async processStream(
    // biome-ignore lint/suspicious/noExplicitAny: Stream can have different shapes
    stream: AsyncIterable<any>,
    hasReasoning: boolean
  ) {
    for await (const part of stream) {
      if (this.abortController?.signal.aborted) {
        throw new Error("Stream aborted by user");
      }
      if (hasReasoning) {
        if (part.type === "text-delta") {
          this.contentBuffer += part.textDelta;
        } else if (part.type === "tool-use") {
          this.reasoningBuffer += JSON.stringify(part.toolUse, null, 2);
        }
      } else {
        this.contentBuffer += part;
      }
      await this.flushBuffers();
    }
  }

  public async finishProcessing() {
    await this.flushBuffers(true);
    if (this.finishData) {
      await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: this.messageId,
        content: this.finishData.text,
        reasoning: this.finishData.reasoning
          ? JSON.stringify(this.finishData.reasoning, null, 2)
          : undefined,
        metadata: {
          finishReason: this.finishData.finishReason,
          providerMetadata: this.finishData.providerMetadata,
        },
      });
    }
  }

  public async handleStop() {
    await this.flushBuffers(true);
    const currentMessage = await this.ctx.runQuery(api.messages.getById, {
      id: this.messageId,
    });
    if (currentMessage) {
      await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: this.messageId,
        metadata: {
          ...(currentMessage.metadata || {}),
          finishReason: "stop",
          stopped: true,
        },
      });
    }
  }
}

// --- Unified Stream Action ---

export const stream = internalAction({
  args: {
    messages: v.array(contextMessageSchema),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    model: v.string(),
    provider: v.string(),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    enableWebSearch: v.optional(v.boolean()),
    webSearchMaxResults: v.optional(v.number()),
    reasoningConfig: v.optional(reasoningConfigForActionSchema),
  },
  handler: async (ctx, args) => {
    const resourceManager = new ResourceManager();
    let abortController: AbortController | null = null;
    const streamHandler = new StreamHandler(ctx, args.messageId);
    const interruptor = new StreamInterruptor(ctx, args.messageId);

    try {
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: true },
        setUpdatedAt: true,
      });

      let actualProvider = args.provider;
      if (args.provider === "polly") {
        actualProvider = mapPollyModelToProvider(args.model);
      }

      const userId = await getAuthUserId(ctx);
      const authenticatedUser = userId
        ? await ctx.runQuery(internal.users.internalGetById, { id: userId })
        : null;

      const apiKey = await getApiKey(
        ctx,
        actualProvider as Exclude<ProviderType, "polly">,
        args.model,
        args.conversationId
      );

      if (!apiKey) {
        throw new Error(
          `No valid API key found for ${actualProvider}. Please add an API key in Settings.`
        );
      }

      // Build context messages if not provided
      let actualMessages = args.messages;
      if (args.messages.length === 0) {
        const conversation = await ctx.runQuery(
          internal.conversations.internalGet,
          { id: args.conversationId }
        );
        const { contextMessages } = await buildContextMessages(ctx, {
          conversationId: args.conversationId,
          personaId: conversation?.personaId,
        });
        actualMessages = contextMessages;
      }

      // Handle Anthropic reasoning models separately
      if (args.provider === "anthropic") {
        const hasReasoningSupport = await isReasoningModel(
          args.provider,
          args.model
        );

        if (hasReasoningSupport) {
          const anthropicHandler = new AnthropicNativeHandler(
            ctx,
            apiKey,
            args.messageId
          );

          abortController = new AbortController();
          anthropicHandler.setAbortController(abortController);

          await anthropicHandler.streamResponse({
            messages: actualMessages as StreamMessage[],
            model: args.model,
            temperature: args.temperature,
            maxTokens: args.maxTokens,
            topP: args.topP,
            reasoningConfig: args.reasoningConfig,
          });

          return;
        }
      }

      const lastUserMessage = [...actualMessages]
        .reverse()
        .find(msg => msg.role === "user");
      const userQuery =
        typeof lastUserMessage?.content === "string"
          ? lastUserMessage.content
          : lastUserMessage?.content
              // biome-ignore lint/suspicious/noExplicitAny: Message content parts can have various types
              ?.filter((part: any) => part.type === "text")
              // biome-ignore lint/suspicious/noExplicitAny: Message content parts can have various types
              .map((part: any) => part.text || "")
              .join(" ") || "";

      let exaCitations: Citation[] = [];
      let searchContext = "";
      let searchQuery = userQuery;
      let searchDecision: SearchDecision | null = null;
      let shouldSearch = false;

      if (args.enableWebSearch !== false && userQuery) {
        try {
          const geminiApiKey = process.env.GEMINI_API_KEY;
          if (!geminiApiKey) {
            throw new Error("Gemini API key not configured");
          }

          const classificationModelName =
            process.env.SEARCH_CLASSIFICATION_MODEL || DEFAULT_POLLY_MODEL_ID;

          const classificationModel = await createLanguageModel(
            ctx,
            "google" as ProviderType,
            classificationModelName,
            geminiApiKey,
            authenticatedUser?._id
          );

          // Build context for better search decisions
          const searchDecisionContext: SearchDecisionContext = {
            userQuery,
            conversationHistory: [],
            previousSearches: [],
          };

          const contextMessages = (args.messages as Doc<"messages">[])
            .filter(msg => msg.role === "context")
            .map(msg => ({
              role: "system",
              content: msg.content,
            }));

          if (
            contextMessages.length > 0 &&
            searchDecisionContext.conversationHistory
          ) {
            searchDecisionContext.conversationHistory.push({
              role: "assistant" as "user" | "assistant",
              content: contextMessages.join("\n\n"),
              hasSearchResults: false,
            });
          }

          if (args.conversationId) {
            const recentMessagesResult = await ctx.runQuery(api.messages.list, {
              conversationId: args.conversationId,
            });

            let recentMessages: Doc<"messages">[] = [];
            if (Array.isArray(recentMessagesResult)) {
              recentMessages = recentMessagesResult;
            } else if (
              recentMessagesResult &&
              typeof recentMessagesResult === "object" &&
              "page" in recentMessagesResult
            ) {
              recentMessages = Array.isArray(recentMessagesResult.page)
                ? (recentMessagesResult.page as Doc<"messages">[])
                : [];
            } else {
              recentMessages = [];
            }

            const historyMessages = recentMessages
              .filter((m: Doc<"messages">) => m && m._id !== args.messageId)
              .slice(-3)
              .map((m: Doc<"messages">) => ({
                role: m.role as "user" | "assistant",
                content: m.content || "",
                hasSearchResults: !!m.citations?.length,
              }));

            if (searchDecisionContext.conversationHistory) {
              searchDecisionContext.conversationHistory.push(
                ...historyMessages
              );
            }

            const previousSearches = recentMessages
              .filter(
                (m: Doc<"messages">) =>
                  m?.metadata?.searchQuery && m._id !== args.messageId
              )
              .slice(-2)
              .map((m: Doc<"messages">) => ({
                query: (m.metadata?.searchQuery as string) || "",
                searchType: (m.metadata?.searchFeature as string) || "search",
                category: m.metadata?.searchCategory as string | undefined,
                resultCount: m.citations?.length || 0,
              }));

            searchDecisionContext.previousSearches = previousSearches;
          }

          const searchNeedPrompt = generateSearchNeedAssessment(
            searchDecisionContext
          );

          const { text: searchNeedText } = await generateText({
            model: classificationModel,
            prompt: searchNeedPrompt,
            temperature: 0.1,
            maxTokens: 300,
          });

          const searchNeedAssessment: SearchNeedAssessment =
            parseSearchNeedAssessment(searchNeedText);

          let searchDecisionResult: SearchDecision;

          if (searchNeedAssessment.canAnswerConfidently) {
            searchDecisionResult = {
              shouldSearch: false,
              searchType: "search",
              reasoning: "Search need assessment: Can answer confidently",
              confidence: 0.9,
              suggestedSources: 0,
              suggestedQuery: userQuery,
            };
          } else {
            const searchStrategyPrompt = generateSearchStrategy(
              searchDecisionContext
            );

            const { text: searchStrategyText } = await generateText({
              model: classificationModel,
              prompt: searchStrategyPrompt,
              temperature: 0.1,
              maxTokens: 300,
            });

            const preliminarySearchDecision = parseSearchStrategy(
              searchStrategyText,
              userQuery
            );

            searchDecisionResult = {
              ...preliminarySearchDecision,
              reasoning: `Search need assessment: Cannot answer confidently. Search strategy: ${preliminarySearchDecision.reasoning}`,
              confidence: 0.7,
            };
          }

          searchDecision = searchDecisionResult;
          shouldSearch = searchDecision.shouldSearch;
          searchQuery = searchDecision.suggestedQuery || userQuery;
        } catch {
          shouldSearch = false;
          searchDecision = {
            shouldSearch: false,
            searchType: "search",
            category: undefined,
            reasoning: "LLM search decision failed - defaulting to no search",
            confidence: 0.1,
            suggestedSources: 0,
            suggestedQuery: userQuery,
          };
        }
      }

      if (shouldSearch && userQuery) {
        const exaApiKey = getExaApiKey();

        if (exaApiKey) {
          const exaFeature = searchDecision?.searchType || "search";
          const category = searchDecision?.category || undefined;

          await ctx.runMutation(internal.messages.internalAtomicUpdate, {
            id: args.messageId,
            metadata: {
              searchQuery,
              searchFeature: exaFeature,
              searchCategory: category,
            },
          });

          const searchResults = await performWebSearch(exaApiKey, {
            query: searchQuery,
            searchType: exaFeature,
            category,
            maxResults: args.webSearchMaxResults || WEB_SEARCH_MAX_RESULTS,
          });

          exaCitations = searchResults.citations;
          searchContext = extractSearchContext(exaFeature, searchResults);

          await ctx.runMutation(internal.messages.internalAtomicUpdate, {
            id: args.messageId,
            metadata: {
              searchQuery,
              searchFeature: exaFeature,
              searchCategory: category,
            },
            citations: exaCitations,
          });
        }
      }

      const messages = await convertMessages(
        ctx,
        actualMessages as StreamMessage[],
        args.provider
      );

      if (searchContext && exaCitations.length > 0) {
        const citationInstructions = dedent`
          You have access to current information from web sources. Use this information naturally in your response and cite sources with numbered references.

          CITATION FORMAT:
          - Add [number] immediately after facts or claims from sources
          - Examples: "React 19 was released in December 2024 [1]." or "The company reported record growth [2][3]."
          - Do NOT create "Sources:" or "References:" sections
          - Do NOT mention "search results" or "according to sources" - just integrate the information naturally

          AVAILABLE INFORMATION:
          ${searchContext}

          SOURCES:
          ${exaCitations
            .map((c, i) => `[${i + 1}] ${c.title || "Web Source"} - ${c.url}`)
            .join("\n")}

          Respond naturally using this information where relevant.
        `;

        messages.push({
          role: "user",
          content: citationInstructions,
        });
      } else if (searchContext) {
        const contextMessage = dedent`
          AVAILABLE INFORMATION:
          ${searchContext}

          Use this information naturally in your response where relevant.
        `;

        messages.push({
          role: "user",
          content: contextMessage,
        });
      }

      const model = await createLanguageModel(
        ctx,
        args.provider as ProviderType,
        args.model,
        apiKey,
        authenticatedUser?._id
      );

      abortController = new AbortController();
      streamHandler.setAbortController(abortController);
      interruptor.setAbortController(abortController);

      const providerOptions = await getProviderStreamOptions(
        ctx,
        args.provider as ProviderType,
        args.model,
        args.reasoningConfig,
        authenticatedUser?._id
      );

      const streamResult = streamText({
        model,
        messages,
        temperature: args.temperature,
        maxTokens: args.maxTokens || -1,
        topP: args.topP,
        frequencyPenalty: args.frequencyPenalty,
        presencePenalty: args.presencePenalty,
        abortSignal: abortController.signal,
        providerOptions,
        onFinish: ({ text, finishReason, reasoning, providerMetadata }) => {
          streamHandler.setFinishData({
            text,
            finishReason,
            reasoning,
            providerMetadata,
          });
        },
      });

      const hasReasoningSupport = await isReasoningModel(
        args.provider,
        args.model
      );
      interruptor.startStopMonitoring();

      if (hasReasoningSupport && streamResult.fullStream) {
        await streamHandler.processStream(streamResult.fullStream, true);
      } else if (streamResult.textStream) {
        await streamHandler.processStream(streamResult.textStream, false);
      } else {
        throw new Error("No valid stream available from the provider.");
      }

      await streamHandler.finishProcessing();
      // biome-ignore lint/suspicious/noExplicitAny: Error can be various types
    } catch (error: any) {
      console.error("stream action ERROR:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (
        error instanceof Error &&
        (error.message.includes("aborted") ||
          error.message.includes("StoppedByUser"))
      ) {
        await streamHandler.handleStop();
        return;
      }

      await ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: args.messageId,
        content: getUserFriendlyErrorMessage(error),
        metadata: { finishReason: "error" },
      });
    } finally {
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: false },
      });
      interruptor.cleanup();
      resourceManager.cleanup();
      abortController = null;
    }
  },
});
