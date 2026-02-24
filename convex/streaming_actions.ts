"use node";

/**
 * Streaming actions that require Node.js runtime (512 MiB memory limit).
 * Separated from conversations.ts because "use node" applies to the entire file.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
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
import { buildContextMessagesForStreaming } from "./lib/conversation/context_building";
import { toImageModelInfos } from "./lib/conversation/helpers";
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

/** Args type for executeStreamMessage */
export type StreamMessageArgs = {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  model: string;
  provider: string;
  messages?: Array<{ role: string; content: unknown }>;
  personaId?: Id<"personas">;
  reasoningConfig?: { enabled: boolean };
  supportsTools?: boolean;
  supportsImages?: boolean;
  supportsFiles?: boolean;
  supportsReasoning?: boolean;
  supportsTemperature?: boolean;
  contextLength?: number;
  contextEndIndex?: number;
  imageModels?: Array<{
    modelId: string;
    name: string;
    description?: string;
    supportedAspectRatios?: string[];
    modelVersion?: string;
  }>;
  userId?: Id<"users">;
};

/**
 * Core streaming logic extracted from streamMessage internalAction.
 * Can be called directly from action context (retry/edit paths) to skip
 * the ~50-200ms Convex scheduler hop.
 */
export async function executeStreamMessage(
  ctx: ActionCtx,
  args: StreamMessageArgs
): Promise<void> {
  const {
    messageId,
    conversationId,
    model: modelId,
    provider,
    supportsTools,
    supportsFiles,
  } = args;

  try {
    // ── Parallel setup: resolve API key, context, image models, replicate key ──
    const needsContextBuild = !args.messages;
    const needsImageModels = supportsTools && !args.imageModels;

    // Reasoning config for stream options (computed before Promise.all)
    const reasoningConfig = args.reasoningConfig?.enabled
      ? { enabled: true as const }
      : undefined;

    const [
      apiKey,
      contextResult,
      imageModelsResult,
      replicateKeyResult,
      streamOptions,
      openRouterSortingResult,
    ] = await Promise.all([
      // 1. Get API key for the provider
      getApiKey(
        ctx,
        provider as Parameters<typeof getApiKey>[1],
        modelId,
        conversationId,
        args.userId
      ),

      // 2. Build context messages (new path) or use pre-built (backward compat)
      needsContextBuild && args.userId
        ? buildContextMessagesForStreaming(ctx, {
            userId: args.userId,
            conversationId,
            personaId: args.personaId,
            includeUpToIndex: args.contextEndIndex,
            modelCapabilities: {
              supportsImages: args.supportsImages ?? false,
              supportsFiles: supportsFiles ?? false,
            },
            provider,
            modelId,
            prefetchedModelInfo: args.contextLength
              ? { contextLength: args.contextLength }
              : undefined,
          })
        : null,

      // 3. Query image models if needed and not pre-provided
      needsImageModels && args.userId
        ? (async () => {
            const userImageModels = await ctx.runQuery(
              internal.imageModels.getUserImageModelsInternal,
              { userId: args.userId as Id<"users"> }
            );
            return toImageModelInfos(userImageModels);
          })()
        : null,

      // 4. Get Replicate API key if tools are supported
      supportsTools && args.userId
        ? getApiKey(
            ctx,
            "replicate",
            undefined,
            conversationId,
            args.userId
          ).catch(() => {
            console.warn(
              "[streamMessage] No Replicate API key available for image generation"
            );
            return undefined;
          })
        : Promise.resolve(undefined),

      // 5. Get provider stream options (independent of other results)
      getProviderStreamOptions(
        ctx,
        provider as Parameters<typeof getProviderStreamOptions>[1],
        modelId,
        reasoningConfig,
        {
          modelId,
          provider,
          supportsReasoning: args.supportsReasoning ?? false,
          supportsTemperature: args.supportsTemperature,
        }
      ),

      // 6. Resolve OpenRouter sorting preference (enables caching)
      provider === "openrouter" && args.userId
        ? ctx
            .runQuery(internal.userSettings.getUserSettingsInternal, {
              userId: args.userId,
            })
            .then(
              (s: { openRouterSorting?: string } | null) =>
                s?.openRouterSorting ?? "default"
            )
            .catch(() => "default" as const)
        : Promise.resolve(undefined),
    ]);

    // Resolve context messages: new build or pre-built from caller
    if (!(contextResult || args.messages)) {
      throw new Error(
        "streamMessage requires either pre-built messages or userId for context building"
      );
    }
    const contextMessages = contextResult
      ? contextResult.contextMessages
      : (args.messages as Array<{ role: string; content: unknown }>);

    // Resolve image models: newly queried or pre-provided from caller
    const imageModels = args.imageModels ?? imageModelsResult ?? undefined;

    const replicateApiKey =
      imageModels && imageModels.length > 0
        ? (replicateKeyResult as string | undefined)
        : undefined;

    // 2. Create language model (needs apiKey from above)
    const languageModel = await createLanguageModel(
      ctx,
      provider as Parameters<typeof createLanguageModel>[1],
      modelId,
      apiKey,
      args.userId,
      openRouterSortingResult ?? undefined
    );

    // 4. Strip attachments from older messages (keep only on last user message)
    const messagesWithRecentAttachmentsOnly =
      stripAttachmentsFromOlderMessages(contextMessages);

    // 5. Convert messages with attachments to AI SDK format
    const convertedMessages = await Promise.all(
      messagesWithRecentAttachmentsOnly.map(async msg => {
        if (typeof msg.content === "string") {
          return msg;
        }

        if (Array.isArray(msg.content)) {
          const convertedParts = await Promise.all(
            msg.content.map((part: LegacyMessagePart) => {
              if (
                part.type === "text" &&
                "text" in part &&
                !("attachment" in part)
              ) {
                return part;
              }

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

    // 6. Stream using consolidated streaming_core
    // skipInitialization: sendMessageHandler already set up streaming state
    await streamLLMToMessage({
      ctx,
      conversationId,
      messageId,
      model: languageModel,
      messages: convertedMessages as Parameters<
        typeof streamLLMToMessage
      >[0]["messages"],
      supportsTools: supportsTools ?? false,
      replicateApiKey,
      imageModels,
      extraOptions: streamOptions,
      skipInitialization: true,
      userId: args.userId,
      modelId,
      provider,
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
    try {
      await ctx.runMutation(internal.conversations.clearStreamingForMessage, {
        conversationId: args.conversationId,
        messageId,
      });
    } catch (e) {
      console.error("[streamMessage] Failed to clear streaming state:", e);
    }
  }
}

/**
 * Server-side streaming action for conversation messages.
 * Uses Node.js runtime for 512 MiB memory (vs 64 MiB in default runtime).
 * This is necessary for providers like Gemini that may use more memory during streaming.
 *
 * NOTE: For retry/edit paths running in action context, prefer calling
 * executeStreamMessage() directly to skip the scheduler hop (~50-200ms).
 */
export const streamMessage = internalAction({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    model: v.string(),
    provider: v.string(),
    messages: v.optional(
      v.array(v.object({ role: v.string(), content: v.any() }))
    ),
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigSchema),
    supportsTools: v.optional(v.boolean()),
    supportsImages: v.optional(v.boolean()),
    supportsFiles: v.optional(v.boolean()),
    supportsReasoning: v.optional(v.boolean()),
    supportsTemperature: v.optional(v.boolean()),
    contextLength: v.optional(v.number()),
    contextEndIndex: v.optional(v.number()),
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
    await executeStreamMessage(ctx, args);
  },
});
