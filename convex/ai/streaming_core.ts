/**
 * Streaming Core — Orchestrator
 *
 * Wires together buffer management and streaming state/lifecycle to drive
 * an LLM streaming session. This file is intentionally thin; domain logic
 * lives in `./streaming/buffer.ts` and `./streaming/state.ts`.
 */
import { streamText, stepCountIs, type LanguageModel } from "ai";
import { createSmoothStreamTransform } from "../../shared/streaming-utils";
import { internal } from "../_generated/api";
import {
  DEFAULT_STREAM_CONFIG,
  humanizeReasoningText,
  isReasoningDelta,
} from "../lib/shared/stream_utils";
import type { Citation } from "../types";
import { getRawErrorMessage, getUserFriendlyErrorMessage } from "./error_handlers";
import { createStreamBuffer } from "./streaming/buffer";
import {
  type StreamingParams,
  type TimingMetrics,
  initializeStreaming,
  configureTools,
  buildToolOptions,
  handleToolCall,
  handleToolResult,
  finalizeSuccess,
  finalizeUserStopped,
  handleStreamError,
} from "./streaming/state";

// Re-export the params type so callers don't need to reach into submodules
export type { StreamingParams } from "./streaming/state";

export async function streamLLMToMessage({
  ctx,
  conversationId,
  messageId,
  model,
  messages,
  supportsTools = false,
  replicateApiKey,
  imageModels = [],
  temperature,
  maxOutputTokens,
  topP,
  frequencyPenalty,
  presencePenalty,
  extraOptions = {},
  abortController,
  userId,
  modelId,
  provider,
  skipInitialization,
}: StreamingParams) {
  // ── Initialize ────────────────────────────────────────────────────────
  if (!skipInitialization) {
    await initializeStreaming(ctx, conversationId, messageId);
  }

  const exaApiKey = process.env.EXA_API_KEY;
  const citationsRef: { value: Citation[] } = { value: [] };
  const hasCalledImageGenRef = { value: false };
  let isToolRunning = false;

  // Timing metrics
  const timing: TimingMetrics = {
    startTime: Date.now(),
    firstTokenTime: undefined,
    reasoningStartTime: undefined,
    reasoningEndTime: undefined,
    hasReceivedContent: false,
  };

  let chunkCounter = 0;

  // ── Buffer ────────────────────────────────────────────────────────────
  const buffer = createStreamBuffer({ ctx, messageId, conversationId });

  // ── Tools ─────────────────────────────────────────────────────────────
  const toolConfig = configureTools(
    messages,
    supportsTools,
    exaApiKey,
    replicateApiKey,
    imageModels,
    messageId,
  );

  // Promote to streaming once first chunk arrives (folded into first flush)
  let setStreaming = false;

  try {
    // ── Build streamText options ───────────────────────────────────────
    const genOpts: Record<string, unknown> & {
      model: LanguageModel;
      messages: typeof messages;
    } = {
      model,
      messages,
      // Only apply smooth stream transform when NOT using tools
      ...(toolConfig.hasAnyTools
        ? {}
        : {
            // biome-ignore lint/style/useNamingConvention: AI SDK option
            experimental_transform: createSmoothStreamTransform(),
          }),
      // AI SDK v6: Telemetry for observability
      // biome-ignore lint/style/useNamingConvention: AI SDK option
      experimental_telemetry: {
        isEnabled: true,
        functionId: "chat-streaming",
        metadata: {
          conversationId,
          messageId,
          ...(userId && { userId }),
          ...(modelId && { modelId }),
          ...(provider && { provider }),
        },
      },
      ...buildToolOptions(
        ctx,
        messageId,
        toolConfig,
        exaApiKey,
        replicateApiKey,
        imageModels,
        hasCalledImageGenRef,
      ),
      ...extraOptions,
    };

    if (toolConfig.hasAnyTools) {
      genOpts.stopWhen = stepCountIs(6); // MAX_TOOL_STEPS (5) + 1
    }
    if (abortController) genOpts.abortSignal = abortController.signal;
    if (temperature !== undefined) genOpts.temperature = temperature;
    if (maxOutputTokens && maxOutputTokens > 0) {
      genOpts.maxOutputTokens = maxOutputTokens;
    }
    if (topP !== undefined) genOpts.topP = topP;
    if (frequencyPenalty !== undefined) {
      genOpts.frequencyPenalty = frequencyPenalty;
    }
    if (presencePenalty !== undefined) {
      genOpts.presencePenalty = presencePenalty;
    }

    // ── Start streaming ───────────────────────────────────────────────
    const result = streamText({
      ...genOpts,
      onChunk: async ({ chunk }) => {
        if (buffer.state.stopped) return;

        // Track first token time for any meaningful chunk
        if (
          !timing.firstTokenTime &&
          (isReasoningDelta(chunk) ||
            (chunk.type === "text-delta" && chunk.text))
        ) {
          timing.firstTokenTime = Date.now();
        }

        if (!setStreaming) {
          setStreaming = true;
          // Fold "streaming" status into the next buffer flush instead of a separate mutation
          buffer.setPendingStatus("streaming");
        }

        // Handle tool call
        if (chunk.type === "tool-call" && !isToolRunning) {
          isToolRunning = true;
          const toolChunk = chunk as {
            toolCallId: string;
            toolName: string;
            input?: Record<string, unknown>;
          };
          await handleToolCall(
            ctx,
            messageId,
            toolChunk,
            buffer,
            hasCalledImageGenRef,
          );
        }

        // Handle tool result
        if (chunk.type === "tool-result") {
          const toolResult = chunk as {
            toolCallId: string;
            output?: { success?: boolean; citations?: Citation[] };
          };
          await handleToolResult(ctx, messageId, toolResult, citationsRef);
          isToolRunning = false;
        }

        // Reasoning chunks
        if (isReasoningDelta(chunk)) {
          if (!timing.reasoningStartTime) {
            timing.reasoningStartTime = Date.now();
          }
          if (!buffer.hasSegmentStartTime) {
            buffer.setSegmentStartTime(Date.now());
          }
          buffer.appendReasoning(humanizeReasoningText(chunk.text));
          if (buffer.reasoningLength >= DEFAULT_STREAM_CONFIG.BATCH_SIZE) {
            await buffer.flush();
          }
          return;
        }

        // Text deltas
        if (chunk.type === "text-delta" && chunk.text) {
          if (
            !timing.hasReceivedContent &&
            timing.reasoningStartTime &&
            !timing.reasoningEndTime
          ) {
            timing.reasoningEndTime = Date.now();
          }
          timing.hasReceivedContent = true;

          buffer.appendContent(chunk.text);
          chunkCounter++;
          if (
            buffer.contentLength >= DEFAULT_STREAM_CONFIG.BATCH_SIZE ||
            chunkCounter % DEFAULT_STREAM_CONFIG.CHECK_STOP_EVERY_N_CHUNKS ===
              0
          ) {
            await buffer.flush();
          }
        }
      },

      onFinish: async ({
        finishReason,
        usage,
        response,
        warnings,
        text: _text,
        reasoning: _reasoning,
      }) => {
        if (buffer.state.stopped) return;
        await buffer.flush();
        await finalizeSuccess(
          ctx,
          conversationId,
          messageId,
          citationsRef.value,
          timing,
          { finishReason, usage, response, warnings },
        );
      },

      onError: async ({ error }) => {
        buffer.state.stopped = true;
        await handleStreamError(ctx, messageId, error);
      },

      onAbort: async ({ steps }) => {
        console.log(`Stream aborted after ${steps.length} steps`);
        buffer.state.userStopped = true;
        buffer.state.stopped = true;
      },
    });

    // If no chunks arrive quickly, ensure UI doesn't stay in "thinking".
    // Use an immediate mutation (not pending buffer) so the status update
    // is guaranteed before consumeStream() starts.
    if (!setStreaming) {
      try {
        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId,
          status: "streaming",
        });
        setStreaming = true;
      } catch {}
    }

    // Consume the stream to trigger onChunk/onFinish callbacks.
    // Using consumeStream() instead of `for await (fullStream)` to avoid memory accumulation.
    await result.consumeStream();
  } catch (error) {
    console.error("Stream error: stream failed", error);
    const errorMessage = getUserFriendlyErrorMessage(error);
    const errorDetail = getRawErrorMessage(error);
    await ctx.runMutation(internal.messages.updateMessageError, {
      messageId,
      error: errorMessage,
      errorDetail: errorDetail !== errorMessage ? errorDetail : undefined,
    });
  } finally {
    if (buffer.state.userStopped) {
      await finalizeUserStopped(ctx, conversationId, messageId, buffer, timing);
    }
    await buffer.stopAll();
  }
}
