import { smoothStream, streamText, type ModelMessage } from "ai";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { log } from "../lib/logger";
import {
  DEFAULT_STREAM_CONFIG,
  humanizeReasoningText,
  isReasoningDelta,
} from "../lib/shared/stream_utils";
import { CONFIG } from "./config";

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
      log.streamError("content flush failed", e);
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
      log.streamError("reasoning flush failed", e);
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
      experimental_transform: smoothStream({
        delayInMs: (CONFIG as any)?.PERF?.SMOOTH_STREAM_DELAY_MS ?? 12,
        chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/, // words w/ unicode CJK support
      }),
      ...extraOptions,
    };

    if (abortController) genOpts.abortSignal = abortController.signal;
    if (temperature !== undefined) genOpts.temperature = temperature;
    if (maxOutputTokens && maxOutputTokens > 0) genOpts.maxOutputTokens = maxOutputTokens;
    if (topP !== undefined) genOpts.topP = topP;
    if (frequencyPenalty !== undefined) genOpts.frequencyPenalty = frequencyPenalty;
    if (presencePenalty !== undefined) genOpts.presencePenalty = presencePenalty;

    // Start the generation immediately and proactively mark as streaming
    const result = streamText({
      ...genOpts,
      onChunk: async ({ chunk }) => {
        if (stopped) return;

        if (!setStreaming) {
          setStreaming = true;
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "streaming",
          });
        }

        // Reasoning chunks (v5 uses "reasoning-delta" type)
        if (isReasoningDelta(chunk)) {
          reasoningBuf += humanizeReasoningText(chunk.text);
          if (reasoningBuf.length >= DEFAULT_STREAM_CONFIG.BATCH_SIZE) {
            await flushReasoning();
          }
          return;
        }

        // Text deltas (v5 uses "text" property instead of "textDelta")
        if (chunk.type === "text-delta" && chunk.text) {
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
      onFinish: async ({ finishReason }) => {
        if (stopped) return;
        await flushReasoning();
        await flushContent();

        // Do not overwrite content; only set finishReason metadata
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: messageId,
          metadata: { finishReason: finishReason || "stop" },
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
    log.streamError("stream failed", error);
    await ctx.runMutation(internal.messages.updateContent, {
      messageId,
      content:
        "The AI provider returned an error. Please try again or rephrase your request.",
      finishReason: "error",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    await ctx.runMutation(internal.messages.updateMessageStatus, {
      messageId,
      status: "error",
    });
  } finally {
    await stopAll();
  }
}
