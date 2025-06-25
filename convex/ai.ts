import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { streamText } from "ai";

// Import types
import { StreamMessage, ProviderType, Citation, WebSource } from "./ai/types";

// Import utilities
import { getUserFriendlyErrorMessage } from "./ai/errors";
import { getApiKey } from "./ai/encryption";
import { createLanguageModel, isReasoningModel } from "./ai/providers";
import {
  convertMessages,
  updateMessage,
  clearConversationStreaming,
} from "./ai/messages";
import { extractCitations } from "./ai/citations";
import { StreamHandler } from "./ai/streaming";

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
    enableWebSearch: v.optional(v.boolean()),
    webSearchMaxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let abortController: AbortController | undefined;
    const streamHandler = new StreamHandler(ctx, args.messageId);

    try {
      // Get API key
      const apiKey = await getApiKey(
        ctx,
        args.provider as ProviderType,
        args.userId
      );

      // Convert messages to AI SDK format
      const messages = await convertMessages(
        ctx,
        args.messages as StreamMessage[],
        args.provider
      );

      // Create language model
      const model = await createLanguageModel(
        ctx,
        args.provider as ProviderType,
        args.model,
        apiKey,
        args.userId,
        args.enableWebSearch
      );

      // Create abort controller for stopping
      abortController = new AbortController();
      streamHandler.setAbortController(abortController);

      // Stream the response
      const result = streamText({
        model,
        messages,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        topP: args.topP,
        frequencyPenalty: args.frequencyPenalty,
        presencePenalty: args.presencePenalty,
        abortSignal: abortController.signal,
        // Enable Google thinking for reasoning models
        ...(args.provider === "google" &&
          isReasoningModel(args.provider, args.model) && {
            providerOptions: {
              google: {
                thinkingConfig: {
                  includeThoughts: true,
                },
              },
            },
          }),
        // Enable reasoning for OpenAI models
        ...(args.provider === "openai" &&
          isReasoningModel(args.provider, args.model) && {
            providerOptions: {
              openai: {
                reasoning: true,
              },
            },
          }),
        onFinish: async ({
          text,
          finishReason,
          reasoning,
          providerMetadata,
        }) => {
          // Store the finish data for later use after stream completes
          streamHandler.setFinishData({
            text,
            finishReason,
            reasoning,
            providerMetadata,
          });
        },
      });

      // Handle streaming
      const supportsReasoning = isReasoningModel(args.provider, args.model);

      // Try full stream for reasoning models, fall back to text stream
      if (supportsReasoning) {
        try {
          await streamHandler.processStream(result.fullStream, true);
        } catch (error) {
          if (error instanceof Error && error.message === "StoppedByUser") {
            throw error;
          }
          await streamHandler.processStream(result.textStream, false);
        }
      } else {
        await streamHandler.processStream(result.textStream, false);
      }

      // Now that streaming is complete, handle the finish
      await streamHandler.finishProcessing();

      // Handle Google search sources
      if (args.provider === "google" && args.enableWebSearch) {
        await handleGoogleSearchSources(ctx, result, args.messageId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "StoppedByUser") {
        await streamHandler.handleStop();
        return;
      }

      if (error instanceof Error && error.message === "MessageDeleted") {
        console.log(
          `Message ${args.messageId} was deleted during streaming, exiting gracefully`
        );
        return;
      }

      // Only try to update the message with error if it still exists
      const messageExists = await ctx
        .runQuery(api.messages.getById, {
          id: args.messageId,
        })
        .then(msg => !!msg)
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
      // Clean up abort controller
      abortController = undefined;
    }
  },
});

// Handle Google search sources
async function handleGoogleSearchSources(
  ctx: ActionCtx,
  result: {
    sources?: Promise<WebSource[]>;
  },
  messageId: Id<"messages">
): Promise<void> {
  try {
    // Wait for sources to be available
    const sources = await result.sources;
    if (sources && sources.length > 0) {
      // Get existing message to check for existing citations
      const message = await ctx.runQuery(api.messages.getById, {
        id: messageId,
      });

      // If message no longer exists, skip
      if (!message) {
        return;
      }

      // Merge sources with existing citations from providerMetadata
      const existingCitations = message.citations || [];
      const sourceCitations = extractCitations(undefined, sources) || [];

      // Combine and deduplicate citations based on URL
      const citationMap = new Map<string, Citation>();
      [...existingCitations, ...sourceCitations].forEach(citation => {
        if (!citationMap.has(citation.url)) {
          citationMap.set(citation.url, citation);
        }
      });

      const mergedCitations = Array.from(citationMap.values());

      if (mergedCitations.length > 0) {
        try {
          await ctx.runMutation(internal.messages.internalAtomicUpdate, {
            id: messageId,
            citations: mergedCitations,
          });

          // Enrich citations with metadata
          await ctx.scheduler.runAfter(
            0,
            internal.citationEnrichment.enrichMessageCitations,
            {
              messageId,
              citations: mergedCitations,
            }
          );
        } catch (error) {
          // If the message was deleted, just log and continue
          if (
            error instanceof Error &&
            (error.message.includes("not found") ||
              error.message.includes("nonexistent document"))
          ) {
            console.log("Message was deleted before citations could be added");
            return;
          }
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Failed to retrieve sources:", error);
  }
}

export const stopStreaming = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    // First check if the message is already stopped or finished
    const message = await ctx.runQuery(api.messages.getById, {
      id: args.messageId,
    });

    // If message doesn't exist or is already stopped/finished, just clear streaming state
    if (
      !message ||
      message.metadata?.stopped ||
      message.metadata?.finishReason
    ) {
      await clearConversationStreaming(ctx, args.messageId);
      return;
    }

    // Try to update the message to stop streaming
    try {
      await ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: args.messageId,
        metadata: {
          finishReason: "stop",
          stopped: true,
          ...(message.metadata || {}), // Preserve existing metadata
        },
      });
    } catch (error) {
      // If the update fails due to concurrent modification, it's likely the streaming
      // already finished or is in the process of finishing, so we can safely ignore
      console.warn(
        "Failed to update message during stop, likely already stopped:",
        error
      );
    }

    // Always clear conversation streaming state
    await clearConversationStreaming(ctx, args.messageId);
  },
});
