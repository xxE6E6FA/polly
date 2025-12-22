"use node";

/**
 * Streaming actions that require Node.js runtime (512 MiB memory limit).
 * Separated from conversations.ts because "use node" applies to the entire file.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { getApiKey } from "./ai/encryption";
import { getUserFriendlyErrorMessage } from "./ai/error_handlers";
import {
  convertLegacyPartToAISDK,
  type LegacyMessagePart,
} from "./ai/message_converter";
import {
  createLanguageModel,
  getProviderStreamOptions,
} from "./ai/server_streaming";
import { streamLLMToMessage } from "./ai/streaming_core";
import { reasoningConfigSchema } from "./lib/schemas";

/**
 * Server-side streaming action for conversation messages.
 * Uses Node.js runtime for 512 MiB memory (vs 64 MiB in default runtime).
 * This is necessary for providers like Gemini that may use more memory during streaming.
 */
export const streamMessage = internalAction({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    model: v.string(),
    provider: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.any() })),
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigSchema),
    // Model capabilities passed from mutation context (where auth is available)
    supportsTools: v.optional(v.boolean()),
    supportsFiles: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const {
      messageId,
      conversationId,
      model: modelId,
      provider,
      supportsTools,
      supportsFiles,
    } = args;

    try {
      // 1. Get API key for the provider
      const apiKey = await getApiKey(
        ctx,
        provider as Parameters<typeof getApiKey>[1],
        modelId,
        conversationId
      );

      // 2. Create language model
      const languageModel = await createLanguageModel(
        ctx,
        provider as Parameters<typeof createLanguageModel>[1],
        modelId,
        apiKey
      );

      // 3. Get reasoning stream options if enabled
      const reasoningConfig = args.reasoningConfig?.enabled
        ? {
            effort: args.reasoningConfig.effort,
            maxTokens: args.reasoningConfig.maxTokens,
          }
        : undefined;

      const streamOptions = await getProviderStreamOptions(
        ctx,
        provider as Parameters<typeof getProviderStreamOptions>[1],
        modelId,
        reasoningConfig
      );

      // 4. Convert messages with attachments to AI SDK format
      // Use capabilities passed from mutation context (where auth is available)

      const convertedMessages = await Promise.all(
        args.messages.map(async msg => {
          // String content - no conversion needed
          if (typeof msg.content === "string") {
            return msg;
          }

          // Array content - convert each part
          if (Array.isArray(msg.content)) {
            const convertedParts = await Promise.all(
              msg.content.map((part: LegacyMessagePart) => {
                // Plain text parts - pass through
                if (
                  part.type === "text" &&
                  "text" in part &&
                  !("attachment" in part)
                ) {
                  return part;
                }

                // Parts with attachments - use unified converter
                if (
                  "attachment" in part ||
                  part.type === "image_url" ||
                  part.type === "file"
                ) {
                  return convertLegacyPartToAISDK(ctx, part, {
                    provider,
                    modelId,
                    supportsFiles: supportsFiles ?? false,
                  });
                }

                return part;
              })
            );

            return {
              ...msg,
              content: convertedParts,
            };
          }

          return msg;
        })
      );

      // 5. Stream using consolidated streaming_core
      await streamLLMToMessage({
        ctx,
        conversationId,
        messageId,
        model: languageModel,
        messages: convertedMessages as Parameters<
          typeof streamLLMToMessage
        >[0]["messages"],
        // Pass capabilities directly instead of re-looking them up (action context lacks auth)
        supportsTools: supportsTools ?? false,
        extraOptions: streamOptions,
      });
    } catch (error) {
      // Update message to error state on any failure (including setup errors before streaming)
      // This prevents messages from being stuck in "thinking" status indefinitely
      console.error("Stream setup error:", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      await ctx.runMutation(internal.messages.updateMessageError, {
        messageId,
        error: errorMessage,
      });
    } finally {
      // Use conditional clearing to prevent race conditions with newer streaming actions.
      // Only clears isStreaming if this message is still the current streaming message.
      await ctx.runMutation(internal.conversations.clearStreamingForMessage, {
        conversationId: args.conversationId,
        messageId,
      });
    }
  },
});
