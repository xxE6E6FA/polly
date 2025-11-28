import { streamText, type ModelMessage } from "ai";
import { createSmoothStreamTransform } from "../../shared/streaming-utils";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  DEFAULT_STREAM_CONFIG,
  humanizeReasoningText,
  isReasoningDelta,
} from "../lib/shared/stream_utils";
import { CONFIG } from "./config";
import { getUserFriendlyErrorMessage } from "./error_handlers";

type StreamingParams = {
  ctx: ActionCtx;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  model: any; // AI SDK LanguageModel
  messages: ModelMessage[];
  // Optional generation params
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  extraOptions?: Record<string, unknown>;
  abortController?: AbortController;
};

export async function streamLLMToMessage({
  ctx,
  conversationId,
  messageId,
  model,
  messages,
  temperature,
  maxOutputTokens,
  topP,
  frequencyPenalty,
  presencePenalty,
  extraOptions = {},
  abortController,
}: StreamingParams) {
  // Initial state
  await ctx.runMutation(internal.messages.updateMessageStatus, {
    messageId,
    status: "thinking",
  });

  // Mark conversation as streaming
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: true },
  });

  // Timing metrics
  const startTime = Date.now();
  let firstTokenTime: number | undefined;
  let reasoningStartTime: number | undefined;
  let reasoningEndTime: number | undefined;
  let hasReceivedContent = false;

  // Lightweight batching buffers
  let contentBuf = "";
  let reasoningBuf = "";
  let chunkCounter = 0;
  let stopped = false;

  const flushContent = async () => {
    if (!contentBuf || stopped) return;
    const toSend = contentBuf;
    contentBuf = "";
    try {
      await ctx.runMutation(internal.messages.updateAssistantContent, {
        messageId,
        appendContent: toSend,
      });
    } catch (e) {
      console.error("Stream error: content flush failed", e);
    }
  };

  const flushReasoning = async () => {
    if (!reasoningBuf || stopped) return;
    const toSend = reasoningBuf;
    reasoningBuf = "";
    try {
      await ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: messageId,
        appendReasoning: toSend,
      });
    } catch (e) {
      console.error("Stream error: reasoning flush failed", e);
    }
  };

  const periodicFlush = setInterval(async () => {
    await flushContent();
    await flushReasoning();
  }, DEFAULT_STREAM_CONFIG.BATCH_TIMEOUT);

  const stopAll = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(periodicFlush);
    try {
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: conversationId,
        updates: { isStreaming: false },
      });
    } catch {}
  };

  // Promote to streaming once first chunk arrives
  let setStreaming = false;

  try {
    const genOpts: any = {
      model,
      messages,
      // biome-ignore lint/style/useNamingConvention: AI SDK option
      experimental_transform: createSmoothStreamTransform(),
      ...extraOptions,
    };

    if (abortController) genOpts.abortSignal = abortController.signal;
    if (temperature !== undefined) genOpts.temperature = temperature;
    if (maxOutputTokens && maxOutputTokens > 0)
      genOpts.maxOutputTokens = maxOutputTokens;
    if (topP !== undefined) genOpts.topP = topP;
    if (frequencyPenalty !== undefined)
      genOpts.frequencyPenalty = frequencyPenalty;
    if (presencePenalty !== undefined)
      genOpts.presencePenalty = presencePenalty;

    // Start the generation immediately and proactively mark as streaming
    const result = streamText({
      ...genOpts,
      onChunk: async ({ chunk }) => {
        if (stopped) return;

        // Track first token time for any meaningful chunk
        if (
          !firstTokenTime &&
          (isReasoningDelta(chunk) ||
            (chunk.type === "text-delta" && chunk.text))
        ) {
          firstTokenTime = Date.now();
        }

        if (!setStreaming) {
          setStreaming = true;
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "streaming",
          });
        }

        // Reasoning chunks (v5 uses "reasoning-delta" type)
        if (isReasoningDelta(chunk)) {
          // Track when reasoning starts
          if (!reasoningStartTime) {
            reasoningStartTime = Date.now();
          }
          reasoningBuf += humanizeReasoningText(chunk.text);
          if (reasoningBuf.length >= DEFAULT_STREAM_CONFIG.BATCH_SIZE) {
            await flushReasoning();
          }
          return;
        }

        // Text deltas (v5 uses "text" property instead of "textDelta")
        if (chunk.type === "text-delta" && chunk.text) {
          // Track when content starts (marks end of reasoning phase)
          if (!hasReceivedContent && reasoningStartTime && !reasoningEndTime) {
            reasoningEndTime = Date.now();
          }
          hasReceivedContent = true;

          contentBuf += chunk.text;
          chunkCounter++;
          if (
            contentBuf.length >= DEFAULT_STREAM_CONFIG.BATCH_SIZE ||
            chunkCounter % DEFAULT_STREAM_CONFIG.CHECK_STOP_EVERY_N_CHUNKS === 0
          ) {
            await flushContent();
          }
        }
      },
      onFinish: async ({
        finishReason,
        usage,
        response,
        warnings,
        text,
        reasoning,
      }) => {
        if (stopped) return;
        await flushReasoning();
        await flushContent();

        // Calculate timing metrics
        const endTime = Date.now();
        const duration = endTime - startTime;
        const timeToFirstTokenMs = firstTokenTime
          ? firstTokenTime - startTime
          : undefined;
        const totalTokens = usage?.totalTokens ?? 0;
        const tokensPerSecond =
          duration > 0 ? totalTokens / (duration / 1000) : 0;

        // Calculate thinking duration (reasoning phase)
        const thinkingDurationMs =
          reasoningStartTime && reasoningEndTime
            ? reasoningEndTime - reasoningStartTime
            : reasoningStartTime
              ? endTime - reasoningStartTime // If no content, reasoning lasted until the end
              : undefined;

        // Use AI SDK v5's rich metadata for comprehensive final state
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: messageId,
          metadata: {
            finishReason: finishReason || "stop",
            tokenUsage:
              usage &&
              usage.totalTokens !== undefined &&
              usage.inputTokens !== undefined &&
              usage.outputTokens !== undefined
                ? {
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    totalTokens: usage.totalTokens,
                    reasoningTokens: usage.reasoningTokens,
                    cachedInputTokens: usage.cachedInputTokens,
                  }
                : undefined,
            providerMessageId: response?.id,
            timestamp: response?.timestamp
              ? new Date(response.timestamp).toISOString()
              : undefined,
            warnings: warnings?.map((w) => {
              if (w.type === "unsupported-setting") {
                return `Unsupported setting: ${w.setting}${w.details ? ` - ${w.details}` : ""}`;
              }
              if (w.type === "unsupported-tool") {
                return `Unsupported tool${w.details ? `: ${w.details}` : ""}`;
              }
              if (w.type === "other") {
                return w.message;
              }
              return String(w);
            }),
            // Timing metrics
            timeToFirstTokenMs,
            tokensPerSecond,
            thinkingDurationMs,
            duration,
          },
        });
        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId,
          status: "done",
        });
      },
    });

    // If no chunks arrive quickly, ensure UI doesn't stay in "thinking"
    // by preemptively marking as streaming once the request is in flight.
    if (!setStreaming) {
      try {
        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId,
          status: "streaming",
        });
        setStreaming = true;
      } catch {}
    }

    // Drain the text stream to trigger onChunk/onFinish
    for await (const _ of result.textStream) {
      if (stopped) break;
    }
  } catch (error) {
    console.error("Stream error: stream failed", error);
    const errorMessage = getUserFriendlyErrorMessage(error);
    await ctx.runMutation(internal.messages.updateMessageError, {
      messageId,
      error: errorMessage,
    });
  } finally {
    await stopAll();
  }
}
