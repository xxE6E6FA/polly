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
import { action } from "./_generated/server";
import { AnthropicNativeHandler } from "./ai/anthropic_native";
import { getApiKey } from "./ai/encryption";
import { getUserFriendlyErrorMessage } from "./ai/errors";
import { extractSearchContext, getExaApiKey, performWebSearch } from "./ai/exa";
import {
  clearConversationStreaming,
  convertMessages,
  updateMessage,
} from "./ai/messages";
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
import { StreamHandler } from "./ai/streaming";
import { buildContextMessages } from "./lib/conversation_utils";
import {
  contextMessageSchema,
  reasoningConfigForActionSchema,
} from "./lib/schemas";
import type { Citation, ProviderType, StreamMessage } from "./types";

// Main streaming action
export const streamResponse = action({
  args: {
    messages: v.array(contextMessageSchema),
    messageId: v.id("messages"),
    model: v.string(),
    provider: v.string(),

    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    enableWebSearch: v.optional(v.boolean()), // false = disable, all else = AI decides
    webSearchMaxResults: v.optional(v.number()),
    reasoningConfig: v.optional(reasoningConfigForActionSchema),
    conversationId: v.optional(v.id("conversations")), // For background job authentication
  },
  handler: async (ctx, args) => {
    const resourceManager = new ResourceManager();
    let abortController: AbortController | null = null;
    const streamHandler = new StreamHandler(ctx, args.messageId);
    const interruptor = new StreamInterruptor(ctx, args.messageId);

    try {
      const message = await ctx.runQuery(api.messages.getById, {
        id: args.messageId,
      });

      const conversationId = args.conversationId || message?.conversationId;

      // Use internalPatch for background jobs to avoid authentication issues
      if (args.conversationId) {
        // Background job - use internal mutation
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: args.conversationId,
          updates: { isStreaming: true },
          setUpdatedAt: true,
        });
      } else if (conversationId) {
        // Regular request - use regular mutation with access checks
        await ctx.runMutation(api.conversations.patch, {
          id: conversationId,
          updates: { isStreaming: true },
          setUpdatedAt: true,
        });
      }

      let actualProvider = args.provider;
      if (args.provider === "polly") {
        actualProvider = mapPollyModelToProvider(args.model);
      }

      let userId: Id<"users"> | null = null;
      let authenticatedUser = null;

      userId = await getAuthUserId(ctx);
      if (userId) {
        authenticatedUser = await ctx.runQuery(internal.users.internalGetById, {
          id: userId,
        });
      }

      // If no user from auth context, try to get from conversation (works for background jobs)
      if (!userId && conversationId) {
        const conversation = await ctx.runQuery(
          internal.conversations.internalGet,
          {
            id: conversationId,
          }
        );
        userId = conversation?.userId || null;
        if (userId) {
          authenticatedUser = await ctx.runQuery(
            internal.users.internalGetById,
            { id: userId }
          );
        }
      }

      const apiKey = await getApiKey(
        ctx,
        actualProvider as Exclude<ProviderType, "polly">,
        args.model,
        conversationId
      );

      if (!apiKey) {
        throw new Error(
          `No valid API key found for ${actualProvider}. Please add an API key in Settings.`
        );
      }

      const hasPlaceholderMessages =
        args.messages.every(
          msg => msg.role === "system" || msg.role === "user"
        ) &&
        args.messages.every(
          msg => typeof msg.content === "string" && msg.content === ""
        );

      let actualMessages = args.messages;
      if (hasPlaceholderMessages && conversationId) {
        const { contextMessages } = await buildContextMessages(ctx, {
          conversationId: conversationId,
        });
        actualMessages = contextMessages;
      }

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

      // Get the last user message to analyze for search needs
      const lastUserMessage = [...actualMessages]
        .reverse()
        .find(msg => msg.role === "user");

      const userQuery =
        typeof lastUserMessage?.content === "string"
          ? lastUserMessage.content
          : lastUserMessage?.content
              .filter(part => part.type === "text")
              .map(part => part.text || "")
              .join(" ") || "";

      let exaCitations: Citation[] = [];
      let searchContext = "";
      let searchQuery = userQuery;
      let searchDecision: SearchDecision | null = null;
      let shouldSearch = false;

      if (args.enableWebSearch === false) {
        shouldSearch = false;
      } else if (userQuery) {
        try {
          const geminiApiKey = process.env.GEMINI_API_KEY;
          if (!geminiApiKey) {
            throw new Error("Gemini API key not configured");
          }

          const classificationModelName =
            process.env.SEARCH_CLASSIFICATION_MODEL || DEFAULT_POLLY_MODEL_ID; // Default to cheapest

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

          if (conversationId) {
            const recentMessagesResult = await ctx.runQuery(api.messages.list, {
              conversationId: conversationId,
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
              .slice(-2) // Last 2 searches
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
            // STEP 2: If LLM cannot answer confidently, determine HOW to search
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

            // Combine both assessments for final decision
            searchDecisionResult = {
              ...preliminarySearchDecision,
              reasoning: `Search need assessment: Cannot answer confidently. Search strategy: ${preliminarySearchDecision.reasoning}`,
              confidence: 0.7, // Default confidence when search is needed
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
              ...(message?.metadata || {}),
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

          // Update message with search results and citations immediately
          await ctx.runMutation(internal.messages.internalAtomicUpdate, {
            id: args.messageId,
            metadata: {
              ...(message?.metadata || {}),
              searchQuery,
              searchFeature: exaFeature,
              searchCategory: category,
            },
            citations: exaCitations,
          });
        }
      }

      // Convert messages to AI SDK format
      const messages = await convertMessages(
        ctx,
        actualMessages as StreamMessage[],
        args.provider
      );

      if (searchContext && exaCitations.length > 0) {
        // Create citation instructions with numbered sources
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

        // Use user role for citation instructions to ensure compatibility across all providers
        // System messages are meant for initial context, not mid-conversation instructions
        messages.push({
          role: "user",
          content: citationInstructions,
        });
      } else if (searchContext) {
        // If we have search context but no citations (edge case), still provide the context
        // but without citation instructions
        const contextMessage = dedent`
          AVAILABLE INFORMATION:
          ${searchContext}

          Use this information naturally in your response where relevant.
        `;

        // Use user role for search context to ensure compatibility across all providers
        // System messages are meant for initial context, not mid-conversation instructions
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

      if (searchContext && exaCitations.length > 0) {
        const totalMessageLength = messages.reduce((total, msg) => {
          return (
            total + (typeof msg.content === "string" ? msg.content.length : 0)
          );
        }, 0);

        // If total message length is too large, it might cause LLM issues
        if (totalMessageLength > 50000) {
          console.warn("Large message array detected:", {
            totalLength: totalMessageLength,
            messageCount: messages.length,
            messageId: args.messageId,
          });
        }
      }

      const streamResult = streamText({
        model,
        messages,
        temperature: args.temperature,
        maxTokens: args.maxTokens || 8192, // Higher default for better responses
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

      if (hasReasoningSupport) {
        try {
          if (!streamResult.fullStream) {
            throw new Error("No fullStream available");
          }
          await streamHandler.processStream(streamResult.fullStream, true);
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === "StoppedByUser" ||
              error.name === "AbortError" ||
              error.message.includes("AbortError") ||
              error.message === "MessageDeleted")
          ) {
            throw error;
          }
          if (!streamResult.textStream) {
            throw new Error("No textStream available");
          }
          await streamHandler.processStream(streamResult.textStream, false);
        }
      } else {
        if (!streamResult.textStream) {
          throw new Error("No textStream available");
        }
        await streamHandler.processStream(streamResult.textStream, false);
      }

      await streamHandler.finishProcessing();
    } catch (error) {
      console.error("streamResponse ERROR:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (
        error instanceof Error &&
        (error.message === "StoppedByUser" ||
          error.name === "AbortError" ||
          error.message.includes("AbortError"))
      ) {
        await streamHandler.handleStop();
        return;
      }

      if (error instanceof Error && error.message === "MessageDeleted") {
        // This is expected behavior when a message is deleted during streaming
        return;
      }

      // Only try to update the message with error if it still exists
      const messageExists = await ctx
        .runQuery(api.messages.getById, {
          id: args.messageId,
        })
        .then(msg => Boolean(msg))
        .catch(() => false);

      if (messageExists) {
        await updateMessage(ctx, args.messageId, {
          content: getUserFriendlyErrorMessage(error),
          finishReason: "error",
        });
      }

      await clearConversationStreaming(ctx, args.messageId);
    } finally {
      // Cleanup operations are synchronous
      interruptor.cleanup();
      resourceManager.cleanup();
      abortController = null;
    }
  },
});

export const stopStreaming = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await clearConversationStreaming(ctx, args.messageId);

    const currentMessage = await ctx.runQuery(api.messages.getById, {
      id: args.messageId,
    });

    if (currentMessage) {
      await ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: args.messageId,
        metadata: {
          ...(currentMessage.metadata || {}),
          finishReason: "stop",
          stopped: true,
        },
      });
    }
  },
});
