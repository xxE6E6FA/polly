"use node";

/**
 * Streaming actions that require Node.js runtime (512 MiB memory limit).
 * Separated from conversations.ts because "use node" applies to the entire file.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { getApiKey } from "./ai/encryption";
import {
  getRawErrorMessage,
  getUserFriendlyErrorMessage,
} from "./ai/error_handlers";
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
 * Check if a message content part is an attachment (image, file, pdf, etc.)
 * Exported for testing.
 */
export function isAttachmentPart(part: unknown): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }
  const p = part as Record<string, unknown>;

  // Check for attachment marker
  if ("attachment" in p) {
    return true;
  }

  // Check for legacy image_url format
  if (p.type === "image_url") {
    return true;
  }

  // Check for file type
  if (p.type === "file") {
    return true;
  }

  // Check for direct attachment types
  if (
    p.type === "image" ||
    p.type === "pdf" ||
    p.type === "audio" ||
    p.type === "video"
  ) {
    return true;
  }

  return false;
}

/**
 * Strip attachments from all messages except the last user message.
 *
 * LLMs don't benefit from seeing old attachments - the conversation text
 * already captures what was discussed about them. This dramatically reduces:
 * - Payload size
 * - Memory usage during conversion
 * - API costs (fewer tokens)
 * - Risk of hitting provider limits
 *
 * Exported for testing.
 */
export function stripAttachmentsFromOlderMessages(
  messages: Array<{ role: string; content: unknown }>
): Array<{ role: string; content: unknown }> {
  // Find the index of the last user message
  let lastUserMessageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserMessageIndex = i;
      break;
    }
  }

  // If no user message found, return as-is
  if (lastUserMessageIndex === -1) {
    return messages;
  }

  // Process messages, keeping attachments only on the last user message
  return messages.map((msg, index) => {
    // Keep the last user message intact (with attachments)
    if (index === lastUserMessageIndex) {
      return msg;
    }

    // For string content, no changes needed
    if (typeof msg.content === "string") {
      return msg;
    }

    // For array content, filter out attachments
    if (Array.isArray(msg.content)) {
      const filteredContent = msg.content.filter(
        part => !isAttachmentPart(part)
      );

      // If we removed attachments and content is now empty, return as-is
      // (the message might have been purely attachments, which is fine to drop)
      if (filteredContent.length === 0 && msg.content.length > 0) {
        // Keep at least an empty text part to maintain message structure
        return {
          ...msg,
          content: [{ type: "text", text: "" }],
        };
      }

      return { ...msg, content: filteredContent };
    }

    return msg;
  });
}

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
    supportsReasoning: v.optional(v.boolean()),
    // Image generation tool support
    imageModels: v.optional(
      v.array(
        v.object({
          modelId: v.string(),
          name: v.string(),
          description: v.optional(v.string()),
          supportedAspectRatios: v.optional(v.array(v.string())),
          modelVersion: v.optional(v.string()),
        })
      )
    ),
    userId: v.optional(v.id("users")),
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
        reasoningConfig,
        {
          modelId,
          provider,
          supportsReasoning: args.supportsReasoning ?? false,
        }
      );

      // 4. Strip attachments from older messages (keep only on last user message)
      // This dramatically reduces payload size and avoids provider limits
      const messagesWithRecentAttachmentsOnly =
        stripAttachmentsFromOlderMessages(args.messages);

      // 5. Convert messages with attachments to AI SDK format
      // Use capabilities passed from mutation context (where auth is available)
      const convertedMessages = await Promise.all(
        messagesWithRecentAttachmentsOnly.map(async msg => {
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

      // 6. Get Replicate API key if image models are available
      let replicateApiKey: string | undefined;
      if (args.imageModels && args.imageModels.length > 0 && args.userId) {
        try {
          replicateApiKey = await getApiKey(
            ctx,
            "replicate",
            undefined,
            conversationId
          );
        } catch {
          // No Replicate API key available — image generation won't be enabled
          console.warn(
            "[streamMessage] No Replicate API key available for image generation"
          );
        }
      }

      // 7. Stream using consolidated streaming_core
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
        replicateApiKey,
        imageModels: args.imageModels,
        extraOptions: streamOptions,
      });
    } catch (error) {
      // Update message to error state on any failure (including setup errors before streaming)
      // This prevents messages from being stuck in "thinking" status indefinitely
      console.error("Stream setup error:", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      const errorDetail = getRawErrorMessage(error);
      await ctx.runMutation(internal.messages.updateMessageError, {
        messageId,
        error: errorMessage,
        errorDetail: errorDetail !== errorMessage ? errorDetail : undefined,
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
