import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import type { Citation, ProviderType } from "../../types";
import { ConvexError } from "convex/values";
import { api, internal } from "../../_generated/api";

import { getAuthUserId } from "@convex-dev/auth/server";
import type { StreamingActionResult, MessageActionArgs } from "./types";
import {
  createMessage,
  incrementUserMessageStats,
  mergeSystemPrompts,
  getPersonaPrompt,
} from "./message_handling";
import { stepCountIs, streamText } from "ai";
import {
  createLanguageModel,
  getProviderStreamOptions,
} from "../../ai/server_streaming";
import { getApiKey } from "../../ai/encryption";
import { createSmoothStreamTransform } from "../../../shared/streaming-utils";
import { isReasoningDelta } from "../shared/stream_utils";
import { convertMessages } from "../../ai/messages";
import { getBaselineInstructions } from "../../constants";
import { createWebSearchTool } from "../../ai/tools";

// Process attachments for storage
export const processAttachmentsForStorage = async (
  _ctx: ActionCtx, // Reserved for future use
  attachments: Array<{
    storageId?: Id<"_storage">;
    url?: string;
    name: string;
    type: "image" | "pdf" | "text" | "audio" | "video";
    size: number;
    content?: string;
    thumbnail?: string;
  }>
): Promise<
  Array<{
    storageId?: Id<"_storage">;
    url: string;
    name: string;
    type: "image" | "pdf" | "text" | "audio" | "video";
    size: number;
    content?: string;
    thumbnail?: string;
    mimeType?: string;
  }>
> => {
  // For now, just pass through the attachments ensuring url is set
  // In a real implementation, you might want to process or validate them
  return attachments.map(attachment => ({
    ...attachment,
    url: attachment.url || "", // Ensure url is never undefined
  }));
};

// (buildContextMessages and handleStreamingError removed; not used in HTTP streaming path)

// Create executeStreamingAction for retry functionality
export const executeStreamingActionForRetry = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    model: string;
    provider: string;
    conversation: any; // Doc<"conversations">
    contextMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    useWebSearch: boolean;
    reasoningConfig?: any;
    // Model capabilities - passed from caller who has access to model info
    supportsTools?: boolean;
    supportsFiles?: boolean;
  }
): Promise<StreamingActionResult> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const { conversationId, model, provider } = args;

  // Create streaming assistant message with status: "thinking"
  // This ensures the message is properly marked as streaming from the start,
  // even if the scheduled streaming action fails or is delayed
  const assistantMessageId = await createMessage(ctx, {
    conversationId,
    role: "assistant",
    content: "", // Empty content for streaming
    status: "thinking",
    model,
    provider: provider as "openai" | "anthropic" | "google" | "groq" | "openrouter" | "replicate" | "elevenlabs",
  });

  // Set conversation as streaming with the message ID to prevent race conditions
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
    messageId: assistantMessageId,
  });

  // Increment user stats
  await incrementUserMessageStats(ctx, userId, model, provider);

  // Schedule server-side streaming
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model,
    provider,
    messages: args.contextMessages,
    reasoningConfig: args.reasoningConfig,
    supportsTools: args.supportsTools ?? false,
    supportsFiles: args.supportsFiles ?? false,
  });

  return {
    assistantMessageId,
  };
};

export type {
  StreamingActionResult,
  MessageActionArgs,
};

export async function streamAndSaveMessage(
  ctx: ActionCtx,
  config: {
    messageId: Id<"messages">;
    conversationId: Id<"conversations">;
    model: string;
    provider: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string | any[] }>;
    personaId?: Id<"personas">;
    reasoningConfig?: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      maxOutputTokens?: number;
    };
  }
) {
  const { messageId, conversationId, model: modelId, provider, messages, personaId, reasoningConfig } = config;

  try {
    // 1. Prepare model and options
    const apiKey = await getApiKey(ctx, provider as Exclude<ProviderType, "polly">, modelId, conversationId);
    const languageModel = await createLanguageModel(ctx, provider as ProviderType, modelId, apiKey);

    // Get model capabilities for PDF processing and tool support
    let supportsFiles = false;
    let supportsTools = false;
    try {
      const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
        modelId,
        provider,
      });
      supportsFiles = modelInfo?.supportsFiles ?? false;
      supportsTools = modelInfo?.supportsTools ?? false;
    } catch {
      // Default to false if we can't get model info
    }

    // Get Exa API key for web search tool
    const exaApiKey = process.env.EXA_API_KEY;
    const webSearchEnabled = supportsTools && !!exaApiKey;

    // 2. Prepare system prompt and messages
    const baseline = getBaselineInstructions(modelId, "UTC", { webSearchEnabled });
    const personaPrompt = await getPersonaPrompt(ctx, personaId);
    const system = mergeSystemPrompts(baseline, personaPrompt);

    // Convert messages to AI SDK format (handles PDF extraction if needed)
    const convertedMessages = await convertMessages(ctx, messages, provider, modelId, supportsFiles);

    // Add system message at the beginning
    const finalMessages = [
      { role: "system" as const, content: system },
      ...convertedMessages
    ];

    // 3. Stream setup
    let contentBuffer = "";
    let reasoningBuffer = "";
    const startTime = Date.now();
    let firstTokenTime: number | undefined;
    let isSearching = false;
    let citationsFromTools: Citation[] = [];

    const streamOpts = await getProviderStreamOptions(
      ctx,
      provider as ProviderType,
      modelId,
      reasoningConfig?.enabled
        ? {
            effort: reasoningConfig.effort,
            maxOutputTokens: reasoningConfig.maxOutputTokens,
          }
        : undefined
    );

    // Build stream options with optional tools
    const streamConfig: Parameters<typeof streamText>[0] = {
      model: languageModel,
      messages: finalMessages,
      ...streamOpts,
      experimental_transform: createSmoothStreamTransform(),
      // AI SDK v6: Telemetry for observability
      // biome-ignore lint/style/useNamingConvention: AI SDK option
      experimental_telemetry: {
        isEnabled: true,
        functionId: "stream-and-save",
        metadata: {
          conversationId,
          messageId,
          modelId,
          provider,
        },
      },
      onChunk: async ({ chunk }) => {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
        }
        if (isReasoningDelta(chunk)) {
          reasoningBuffer += chunk.text;
        }
        // Handle tool call chunks - set status to "searching"
        if (chunk.type === "tool-call" && !isSearching) {
          isSearching = true;
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "searching",
          });
        }
        // Handle tool result chunks - extract citations
        if (chunk.type === "tool-result" && chunk.output) {
          const toolOutput = chunk.output as {
            success?: boolean;
            citations?: Citation[];
          };
          if (toolOutput.success && toolOutput.citations) {
            citationsFromTools = toolOutput.citations;
          }
          // Reset searching status
          isSearching = false;
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "streaming",
          });
        }
      },
      onFinish: async ({ usage, response, warnings }) => {
        // Capture final metadata
        const endTime = Date.now();
        const duration = endTime - startTime;
        const timeToFirstTokenMs = firstTokenTime
          ? firstTokenTime - startTime
          : undefined;
        const totalTokens = usage?.totalTokens ?? 0;
        const tokensPerSecond =
          duration > 0 ? totalTokens / (duration / 1000) : 0;

        await ctx.runMutation(internal.messages.updateContent, {
          messageId,
          content: contentBuffer,
          reasoning: reasoningBuffer,
          finishReason: "stop",
          tokenUsage: {
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            totalTokens: totalTokens,
          },
          providerMessageId: response.id,
          timestamp: response.timestamp?.toString(),
          // AI SDK v6 unified Warning type with feature + details
          warnings: warnings?.map(w => {
            if (w.type === "unsupported") {
              return `Unsupported: ${w.feature}${w.details ? ` - ${w.details}` : ""}`;
            }
            if (w.type === "compatibility") {
              return `Compatibility: ${w.feature}${w.details ? ` - ${w.details}` : ""}`;
            }
            if (w.type === "other") {
              return w.message;
            }
            return JSON.stringify(w);
          }),
          timeToFirstTokenMs,
          tokensPerSecond,
          // Include citations from tool calls
          citations:
            citationsFromTools.length > 0 ? citationsFromTools : undefined,
        });
      },
      // AI SDK v6: Handle errors during streaming without crashing
      onError: ({ error }) => {
        console.error("Stream error in onError callback:", error);
      },
    };

    // Add web search tool if model supports it and Exa API key is available
    if (supportsTools && exaApiKey) {
      streamConfig.tools = {
        webSearch: createWebSearchTool(exaApiKey),
      };
      streamConfig.stopWhen = stepCountIs(3);
    }

    const result = streamText(streamConfig);

    // 4. Stream and save loop
    let lastSaveTime = Date.now();
    let lastSaveLength = 0;
    const BATCH_INTERVAL = 100; // ms
    const BATCH_CHARS = 50;

    for await (const chunk of result.textStream) {
      contentBuffer += chunk;

      const now = Date.now();
      const charDiff = contentBuffer.length - lastSaveLength;

      if (now - lastSaveTime >= BATCH_INTERVAL || charDiff >= BATCH_CHARS) {
        const shouldContinue = await ctx.runMutation(internal.messages.updateContent, {
          messageId,
          content: contentBuffer,
          reasoning: reasoningBuffer,
        });

        if (!shouldContinue) {
          // Message was stopped by user or deleted
          return;
        }

        lastSaveTime = now;
        lastSaveLength = contentBuffer.length;
      }
    }

    // Final save is handled by onFinish
  } catch (error) {
    console.error("Streaming failed:", error);
    await ctx.runMutation(internal.messages.updateMessageStatus, {
      messageId,
      status: "error",
    });
    // Re-throw to ensure caller knows it failed
    throw error;
  }
}
