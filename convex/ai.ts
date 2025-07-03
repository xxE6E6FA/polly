import { streamText, generateText } from "ai";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { type Doc } from "./_generated/dataModel";
import { getApiKey } from "./ai/encryption";
import { getUserFriendlyErrorMessage } from "./ai/errors";
import {
  clearConversationStreaming,
  convertMessages,
  updateMessage,
} from "./ai/messages";
import { createLanguageModel, getProviderStreamOptions } from "./ai/providers";
import { ResourceManager } from "./ai/resource_manager";
import { isReasoningModelEnhanced } from "./ai/reasoning_detection";
import { StreamHandler } from "./ai/streaming";
import { StreamInterruptor } from "./ai/stream_interruptor";
import { AnthropicNativeHandler } from "./ai/anthropic_native";
import { getExaApiKey, performWebSearch, extractSearchContext } from "./ai/exa";
import {
  generateSearchDecisionPromptWithContext,
  parseSearchDecision,
  type SearchDecision,
  type SearchDecisionContext,
} from "./ai/search_detection";
import { type Citation, type ProviderType, type StreamMessage } from "./types";
import { WEB_SEARCH_MAX_RESULTS } from "./constants";

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
              if (msg.role !== "system") return false;
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

              // Handle both array and pagination result
              const recentMessages = Array.isArray(recentMessagesResult)
                ? recentMessagesResult
                : recentMessagesResult.page;

              // Get last 3 messages (excluding current)
              const historyMessages = recentMessages
                .filter((m: Doc<"messages">) => m._id !== args.messageId)
                .slice(-3)
                .map((m: Doc<"messages">) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content,
                  hasSearchResults: !!m.citations?.length,
                }));

              // Append to existing context (which may include context summary)
              if (searchContext.conversationHistory) {
                searchContext.conversationHistory.push(...historyMessages);
              }

              // Extract previous searches
              const previousSearches = recentMessages
                .filter(
                  (m: Doc<"messages">) =>
                    m.metadata?.searchQuery && m._id !== args.messageId
                )
                .slice(-2) // Last 2 searches
                .map((m: Doc<"messages">) => ({
                  query: m.metadata!.searchQuery as string,
                  searchType: (m.metadata!.searchFeature as string) || "search",
                  category: m.metadata?.searchCategory as string | undefined,
                  resultCount: m.citations?.length || 0,
                }));

              searchContext.previousSearches = previousSearches;
            } catch {
              // Continue without context on error
            }
          }

          const decisionPrompt =
            generateSearchDecisionPromptWithContext(searchContext);

          const { text } = await generateText({
            model: classificationModel,
            prompt: decisionPrompt,
            temperature: 0.1, // Low temperature for consistent classification
            maxTokens: 300, // Slightly more for context
          });

          searchDecision = parseSearchDecision(text, userQuery);
          shouldSearch =
            searchDecision.shouldSearch && searchDecision.confidence >= 0.7;
        } catch {
          // Fallback: default to no search on LLM failure
          shouldSearch = false;
          searchDecision = {
            shouldSearch: false,
            searchType: "search",
            category: undefined,
            reasoning: "LLM search decision failed - defaulting to no search",
            confidence: 0.1,
            suggestedSources: undefined,
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
            console.error("=== Web search error ===", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
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
        const citationInstructions = `🚨 CRITICAL CITATION REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY 🚨

You have web search results to use in your response. YOU MUST cite them properly.

✅ CORRECT citation format:
- "The Pre-Raphaelite Brotherhood was founded in 1848 [6]."
- "According to recent data [2], the trend has shifted significantly."
- "Multiple sources [1][3][7] confirm this approach."

❌ WRONG - DO NOT DO THIS:
- Do NOT write "Sources:" or "References:" sections
- Do NOT list URLs at the end
- Do NOT say "according to the search results" without a citation number
- Do NOT write footnotes

📋 YOUR TASK:
1. Read the search results below
2. Use information from them in your response
3. ALWAYS add [number] immediately after any fact/claim from the search results
4. The citation numbers correspond to the sources listed at the bottom

⚠️ IMPORTANT: If you don't use inline citations [1], [2], etc., the sources won't be displayed to the user!

SEARCH RESULTS:
${searchContext}

AVAILABLE SOURCES FOR CITATION:
${exaCitations.map((c, i) => `[${i + 1}] ${c.title || "Web Source"} - ${c.url}`).join("\n")}

REMEMBER: Use [1], [2], [3] etc. inline when citing facts. NO "Sources:" section at the end!`;

        // Always insert citation instructions as a separate system message
        // This ensures persona prompts remain intact and citation instructions are clear
        let lastUserIndex = messages.length - 1;
        while (lastUserIndex >= 0 && messages[lastUserIndex].role !== "user") {
          lastUserIndex--;
        }

        if (lastUserIndex >= 0) {
          // Insert citation instructions right before the last user message
          messages.splice(lastUserIndex, 0, {
            role: "system",
            content: citationInstructions,
          });
        } else {
          // Fallback: add at the end if no user message found
          messages.push({
            role: "system",
            content: citationInstructions,
          });
        }
      } else if (searchContext) {
        // If we have search context but no citations (edge case), still provide the context
        // but without citation instructions
        const contextMessage = `SEARCH RESULTS:
${searchContext}

Note: Please use this information to help answer the user's query.`;

        // Always insert search context as a separate system message
        let lastUserIndex = messages.length - 1;
        while (lastUserIndex >= 0 && messages[lastUserIndex].role !== "user") {
          lastUserIndex--;
        }

        if (lastUserIndex >= 0) {
          messages.splice(lastUserIndex, 0, {
            role: "system",
            content: contextMessage,
          });
        } else {
          messages.push({
            role: "system",
            content: contextMessage,
          });
        }
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
        args.provider as ProviderType,
        args.model,
        args.reasoningConfig
      );

      const truncateContent = (content: string, maxLength: number): string => {
        if (content.length <= maxLength) return content;

        const truncateAt =
          content.lastIndexOf("\n", maxLength - 100) || maxLength - 100;
        return (
          content.substring(0, truncateAt) +
          "\n\n[Content truncated for length...]"
        );
      };

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
            console.error(
              "=== No fullStream available despite reasoning support ==="
            );
            throw new Error("No fullStream available");
          }
          await streamHandler.processStream(streamResult.fullStream, true);
        } catch (error) {
          console.error("=== Full stream error ===", error);
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
            console.error("=== No textStream available for fallback ===");
            throw new Error("No textStream available");
          }
          await streamHandler.processStream(streamResult.textStream, false);
        }
      } else {
        if (!streamResult.textStream) {
          console.error("=== No textStream available ===");
          throw new Error("No textStream available");
        }
        await streamHandler.processStream(streamResult.textStream, false);
      }

      await streamHandler.finishProcessing();
    } catch (error) {
      console.error("=== streamResponse ERROR ===", {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
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
