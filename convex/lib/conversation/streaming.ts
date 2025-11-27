import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import type { ProviderType } from "../../types";
import { ConvexError } from "convex/values";
import { api } from "../../_generated/api";
 
import { getAuthUserId } from "@convex-dev/auth/server";
import type { StreamingActionResult, MessageActionArgs } from "./types";
import { createMessage, incrementUserMessageStats, mergeSystemPrompts, getPersonaPrompt } from "./message_handling";
import { streamText } from "ai";
import { createLanguageModel, getProviderStreamOptions } from "../../ai/server_streaming";
import { getApiKey } from "../../ai/encryption";
import { createSmoothStreamTransform } from "../../../shared/streaming-utils";
import { isReasoningDelta } from "../shared/stream_utils";
import { internal } from "../../_generated/api";
import { convertMessages } from "../../ai/messages";
import { getBaselineInstructions } from "../../constants";

// Process attachments for storage
export const processAttachmentsForStorage = async (
  _ctx: ActionCtx, // Reserved for future use
  attachments: Array<{
    storageId?: Id<"_storage">;
    url?: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
  }>
): Promise<
  Array<{
    storageId?: Id<"_storage">;
    url: string;
    name: string;
    type: "image" | "pdf" | "text";
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
  }
): Promise<StreamingActionResult> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const { conversationId, model, provider } = args;

  // Create streaming assistant message
  const assistantMessageId = await createMessage(ctx, {
    conversationId,
    role: "assistant",
    content: "", // Empty content for streaming
    model,
    provider: provider as "openai" | "anthropic" | "google" | "groq" | "openrouter" | "replicate" | "elevenlabs",
    metadata: {
      status: "pending",
    },
  });

  // Set conversation as streaming
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
  });

  // Increment user stats
  await incrementUserMessageStats(ctx, userId, model, provider);

  // Schedule server-side streaming
  await ctx.scheduler.runAfter(0, internal.conversations.streamMessage, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model,
    provider,
    messages: args.contextMessages,
    reasoningConfig: args.reasoningConfig,
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
      maxTokens?: number;
    };
  }
) {
  const { messageId, conversationId, model: modelId, provider, messages, personaId, reasoningConfig } = config;

  try {
    // 1. Prepare model and options
    const apiKey = await getApiKey(ctx, provider as Exclude<ProviderType, "polly">, modelId, conversationId);
    const languageModel = await createLanguageModel(ctx, provider as ProviderType, modelId, apiKey);

    // Get model capabilities for PDF processing
    let supportsFiles = false;
    try {
      const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
        modelId,
        provider,
      });
      supportsFiles = modelInfo?.supportsFiles ?? false;
    } catch {
      // Default to false if we can't get model info
    }

    // 2. Prepare system prompt and messages
    const baseline = getBaselineInstructions(modelId);
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
    
    const streamOpts = await getProviderStreamOptions(
      ctx,
      provider as ProviderType,
      modelId,
      reasoningConfig?.enabled
        ? {
            effort: reasoningConfig.effort,
            maxTokens: reasoningConfig.maxTokens,
          }
        : undefined
    );

    const result = streamText({
      model: languageModel,
      messages: finalMessages,
      ...streamOpts,
      experimental_transform: createSmoothStreamTransform(),
      onChunk: ({ chunk }) => {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
        }
        if (isReasoningDelta(chunk)) {
          reasoningBuffer += chunk.text;
        }
      },
      onFinish: async ({ usage, response, warnings }) => {
        // Capture final metadata
        const tokenUsage = usage as any;
        const endTime = Date.now();
        const duration = endTime - startTime;
        const timeToFirstTokenMs = firstTokenTime ? firstTokenTime - startTime : undefined;
        const totalTokens = tokenUsage.totalTokens ?? 0;
        const tokensPerSecond = duration > 0 ? (totalTokens / (duration / 1000)) : 0;

        await ctx.runMutation(internal.messages.updateContent, {
          messageId,
          content: contentBuffer,
          reasoning: reasoningBuffer,
          finishReason: "stop",
          tokenUsage: {
            inputTokens: tokenUsage.promptTokens ?? tokenUsage.inputTokens ?? 0,
            outputTokens: tokenUsage.completionTokens ?? tokenUsage.outputTokens ?? 0,
            totalTokens: totalTokens,
          },
          providerMessageId: response.id,
          timestamp: response.timestamp?.toString(),
          warnings: warnings?.map(w => 
            w.type === "unsupported-setting" 
              ? `Unsupported setting: ${w.setting}${w.details ? ` (${w.details})` : ""}` 
              : JSON.stringify(w)
          ),
          timeToFirstTokenMs,
          tokensPerSecond,
          // Sources from onFinish are currently documents (LanguageModelV2Source), not web citations.
          // We'll skip mapping them for now until we have a way to get web citations.
          // citations: sources?.map(s => ({ ... })),
        });
      },
    });

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
