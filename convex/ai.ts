import { generateText, streamText } from "ai";
import { v } from "convex/values";
import dedent from "dedent";

import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
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
import { isReasoningModelEnhanced } from "./ai/reasoning_detection";
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
import { WEB_SEARCH_MAX_RESULTS } from "./constants";
import type { Citation, ProviderType, StreamMessage } from "./types";

// Main streaming action
export const streamResponse = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system")
        ),
        content: v.union(
          v.string(),
          v.array(
            v.object({
              type: v.union(
                v.literal("text"),
                v.literal("image_url"),
                v.literal("file")
              ),
              text: v.optional(v.string()),
              image_url: v.optional(v.object({ url: v.string() })),
              file: v.optional(
                v.object({ filename: v.string(), file_data: v.string() })
              ),
              attachment: v.optional(
                v.object({
                  storageId: v.id("_storage"),
                  type: v.string(),
                  name: v.string(),
                })
              ),
            })
          )
        ),
      })
    ),
    messageId: v.id("messages"),
    model: v.string(),
    provider: v.string(),
    userId: v.optional(v.id("users")),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    enableWebSearch: v.optional(v.boolean()), // false = disable, all else = AI decides
    webSearchMaxResults: v.optional(v.number()),
    reasoningConfig: v.optional(
      v.object({
        effort: v.optional(
          v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
        ),
        maxTokens: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const resourceManager = new ResourceManager();
    let abortController: AbortController | null = null;
    const streamHandler = new StreamHandler(ctx, args.messageId);
    const interruptor = new StreamInterruptor(ctx, args.messageId);

    try {
      // Ensure conversation is marked as streaming at the start
      const message = await ctx.runQuery(api.messages.getById, {
        id: args.messageId,
      });

      if (message?.conversationId) {
        await ctx.runMutation(api.conversations.setStreamingState, {
          id: message.conversationId,
          isStreaming: true,
        });
      }

      // Get API key
      const apiKey = await getApiKey(
        ctx,
        args.provider as ProviderType,
        args.userId
      );

      // Check if we should use native Anthropic handler for reasoning
      if (args.provider === "anthropic") {
        const hasReasoningSupport = await isReasoningModelEnhanced(
          args.provider,
          args.model
        );

        if (hasReasoningSupport) {
          // Use native Anthropic handler for reasoning models
          const anthropicHandler = new AnthropicNativeHandler(
            ctx,
            apiKey,
            args.messageId
          );

          abortController = new AbortController();
          anthropicHandler.setAbortController(abortController);

          await anthropicHandler.streamResponse({
            messages: args.messages as StreamMessage[],
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
      const lastUserMessage = [...args.messages]
        .reverse()
        .find(msg => msg.role === "user");

      const userQuery =
        typeof lastUserMessage?.content === "string"
          ? lastUserMessage.content
          : lastUserMessage?.content
              .filter(part => part.type === "text")
              .map(part => part.text || "")
              .join(" ") || "";

      // Handle Exa web search if needed
      let exaCitations: Citation[] = [];
      let searchContext = "";
      let searchQuery = "";
      let searchDecision: SearchDecision | null = null;

      // We'll include previous search context if available, regardless of query type
      // The LLM can decide how to use it based on the actual query

      // Determine if web search is needed
      // Simplified approach: Only respect explicit false, otherwise use AI detection
      // This provides backward compatibility while reducing complexity
      let shouldSearch = false;

      if (args.enableWebSearch === false) {
        // User explicitly disabled search - respect that
        shouldSearch = false;
      } else if (userQuery) {
        // For all other cases (true, undefined, null), use intelligent detection
        // Even for follow-ups, check if user explicitly wants a new search
        try {
          // Use Gemini Flash Lite for quick classification
          // Benefits:
          // 1. App-level API key (no user key required)
          // 2. Extremely cheap (~$0.01 per 1M tokens)
          // 3. Fast response times for simple classification
          // 4. Good enough accuracy for search detection
          const geminiApiKey = process.env.GEMINI_API_KEY;
          if (!geminiApiKey) {
            throw new Error("Gemini API key not configured");
          }

          // Allow override via env var for testing different models
          const classificationModelName =
            process.env.SEARCH_CLASSIFICATION_MODEL ||
            "gemini-2.5-flash-lite-preview-06-17"; // Default to cheapest

          const classificationModel = await createLanguageModel(
            ctx,
            "google" as ProviderType,
            classificationModelName,
            geminiApiKey,
            args.userId
          );

          // Build context for better search decisions
          const searchContext: SearchDecisionContext = {
            userQuery,
            conversationHistory: [],
            previousSearches: [],
          };

          // Extract context messages from the current message array
          // Context messages are system messages that provide background from previous conversations
          const contextMessages = args.messages
            .filter(msg => {
              if (msg.role !== "system") {
                return false;
              }
              const contentStr =
                typeof msg.content === "string"
                  ? msg.content
                  : msg.content
                      .filter(part => part.type === "text")
                      .map(part => part.text || "")
                      .join(" ");
              return (
                contentStr.includes("Context from previous conversation") ||
                contentStr.includes("Previous conversation") ||
                contentStr.includes("summarized the following conversation")
              );
            })
            .map(msg => {
              return typeof msg.content === "string"
                ? msg.content
                : msg.content
                    .filter(part => part.type === "text")
                    .map(part => part.text || "")
                    .join(" ");
            });

          // Add the context summary to conversation history if available
          if (contextMessages.length > 0 && searchContext.conversationHistory) {
            // Add context as a special "context" role message
            searchContext.conversationHistory.push({
              role: "assistant" as "user" | "assistant", // Type requirement
              content: contextMessages.join("\n\n"),
              hasSearchResults: false,
            });
          }

          // Add conversation history if available
          if (message?.conversationId) {
            try {
              const recentMessagesResult = await ctx.runQuery(
                api.messages.list,
                {
                  conversationId: message.conversationId,
                }
              );

              // Handle both array and pagination result safely
              let recentMessages: Doc<"messages">[] = [];
              if (Array.isArray(recentMessagesResult)) {
                recentMessages = recentMessagesResult;
              } else if (
                recentMessagesResult &&
                typeof recentMessagesResult === "object" &&
                "page" in recentMessagesResult
              ) {
                recentMessages = Array.isArray(recentMessagesResult.page)
                  ? recentMessagesResult.page
                  : [];
              } else {
                recentMessages = [];
              }

              // Get last 3 messages (excluding current) with safety checks
              const historyMessages = recentMessages
                .filter((m: Doc<"messages">) => m && m._id !== args.messageId)
                .slice(-3)
                .map((m: Doc<"messages">) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content || "",
                  hasSearchResults: !!m.citations?.length,
                }));

              // Append to existing context (which may include context summary)
              if (searchContext.conversationHistory) {
                searchContext.conversationHistory.push(...historyMessages);
              }

              // Extract previous searches with safety checks
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

              searchContext.previousSearches = previousSearches;
            } catch (_error) {
              // Continue without context on error
            }
          }

          const searchNeedPrompt = generateSearchNeedAssessment(searchContext);

          const { text: searchNeedText } = await generateText({
            model: classificationModel,
            prompt: searchNeedPrompt,
            temperature: 0.1, // Low temperature for consistent classification
            maxTokens: 300,
          });

          const searchNeedAssessment: SearchNeedAssessment =
            parseSearchNeedAssessment(searchNeedText);

          let searchDecisionResult: SearchDecision;

          // If LLM can answer confidently, skip search entirely
          if (
            searchNeedAssessment.canAnswerConfidently &&
            searchNeedAssessment.confidence > 0.6
          ) {
            searchDecisionResult = {
              shouldSearch: false,
              searchType: "search",
              reasoning: `Search need assessment: ${searchNeedAssessment.reasoning}`,
              confidence: searchNeedAssessment.confidence,
              suggestedSources: 0,
              suggestedQuery: userQuery,
            };
          } else {
            // STEP 2: If LLM cannot answer confidently, determine HOW to search
            const searchStrategyPrompt = generateSearchStrategy(searchContext);

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
              reasoning: `Search need assessment: ${searchNeedAssessment.reasoning}. Search strategy: ${preliminarySearchDecision.reasoning}`,
              confidence: searchNeedAssessment.confidence, // Use search need assessment confidence as the primary confidence
            };
          }

          searchDecision = searchDecisionResult;
          shouldSearch = searchDecision.shouldSearch;
        } catch {
          // Fallback: default to no search on LLM failure
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
          try {
            // Use search decision from LLM
            const exaFeature = searchDecision?.searchType || "search";
            const category = searchDecision?.category || undefined;

            // Use the LLM's suggested query if available, otherwise use the original query
            searchQuery = searchDecision?.suggestedQuery || userQuery;

            // Update message with search query and feature type immediately
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
          } catch (error) {
            console.error("Web search error:", {
              error: error instanceof Error ? error.message : String(error),
              searchQuery,
              exaFeature: searchDecision?.searchType,
            });
            // Continue without web search on error
          }
        }
      }

      // Convert messages to AI SDK format
      const messages = await convertMessages(
        ctx,
        args.messages as StreamMessage[],
        args.provider
      );

      // The LLM already has access to previous search results through the conversation history
      // No need to duplicate this information

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
        args.userId
      );

      abortController = new AbortController();
      streamHandler.setAbortController(abortController);
      interruptor.setAbortController(abortController);

      const providerOptions = await getProviderStreamOptions(
        ctx,
        args.provider as ProviderType,
        args.model,
        args.reasoningConfig,
        args.userId
      );

      // Check if model supports reasoning for debugging
      const modelSupportsReasoning = await isReasoningModelEnhanced(
        args.provider,
        args.model
      );

      // Add debugging for Google provider models before DLLF call
      if (args.provider === "google") {
        console.log("🔍 [AI-ACTION] Google DLLF call debug:", {
          model: args.model,
          providerOptions,
          reasoningConfig: args.reasoningConfig,
          hasReasoningSupport: modelSupportsReasoning,
          timestamp: new Date().toISOString(),
        });
      }

      const truncateContent = (content: string, maxLength: number): string => {
        if (content.length <= maxLength) {
          return content;
        }

        const truncateAt =
          content.lastIndexOf("\n", maxLength - 100) || maxLength - 100;
        return (
          content.substring(0, truncateAt) +
          "\n\n[Content truncated for length...]"
        );
      };

      // Validate message array complexity for follow-up messages with search
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

      const MAX_SYSTEM_MESSAGE_LENGTH = 5000; // Reduced from 10000
      messages.forEach((msg, index) => {
        if (msg.role === "system" && typeof msg.content === "string") {
          if (msg.content.length > MAX_SYSTEM_MESSAGE_LENGTH) {
            messages[index].content = truncateContent(
              msg.content,
              MAX_SYSTEM_MESSAGE_LENGTH
            );
          }
        }
      });

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
          // Add debugging for Google provider models in onFinish
          if (args.provider === "google") {
            console.log("🔍 [AI-ACTION] Google onFinish debug:", {
              model: args.model,
              finishReason,
              hasReasoning: !!reasoning,
              reasoningLength: reasoning?.length || 0,
              hasProviderMetadata: !!providerMetadata,
              providerMetadata,
              timestamp: new Date().toISOString(),
            });
          }

          streamHandler.setFinishData({
            text,
            finishReason,
            reasoning,
            providerMetadata,
          });
        },
      });

      const hasReasoningSupport = await isReasoningModelEnhanced(
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
      throw error;
    } finally {
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

    try {
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
    } catch {
      // Message might not exist or already be updated, which is fine
      // The stream handler will also set these flags when it detects the abort
    }
  },
});
