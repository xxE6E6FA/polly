import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createSmoothStreamTransform } from "../../shared/streaming-utils";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  DEFAULT_STREAM_CONFIG,
  humanizeReasoningText,
  isReasoningDelta,
} from "../lib/shared/stream_utils";
import type { Citation } from "../types";
import { getUserFriendlyErrorMessage } from "./error_handlers";
import { createWebSearchTool } from "./tools";

type StreamingParams = {
  ctx: ActionCtx;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  model: any; // AI SDK LanguageModel
  messages: ModelMessage[];
  // Model capability for tool calling (passed from mutation context where auth is available)
  supportsTools?: boolean;
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
  supportsTools = false,
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

  // Mark conversation as streaming, set current message ID, and clear any previous stop request.
  // The currentStreamingMessageId prevents race conditions where an old streaming action's
  // finally block could clear isStreaming after a new action has already started.
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: true, currentStreamingMessageId: messageId },
    clearFields: ["stopRequested"],
  });

  // Check for Exa API key (supportsTools is passed from mutation context where auth is available)
  const exaApiKey = process.env.EXA_API_KEY;

  // Track citations from tool results
  let citationsFromTools: Citation[] = [];
  let isSearching = false;

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
  let userStopped = false; // Track if stopped by user request

  const flushContent = async () => {
    if (!contentBuf || stopped) return;
    const toSend = contentBuf;
    contentBuf = "";
    try {
      const result = await ctx.runMutation(
        internal.messages.updateAssistantContent,
        {
          messageId,
          appendContent: toSend,
        }
      );
      // Check stop signal from mutation - interrupt at the source
      if (result?.shouldStop) {
        userStopped = true;
        stopped = true;
      }
    } catch (e) {
      console.error("Stream error: content flush failed", e);
    }
  };

  const flushReasoning = async () => {
    if (!reasoningBuf || stopped) return;
    const toSend = reasoningBuf;
    reasoningBuf = "";
    try {
      const result = await ctx.runMutation(
        internal.messages.internalAtomicUpdate,
        {
          id: messageId,
          appendReasoning: toSend,
        }
      );
      // Check stop signal from mutation - interrupt at the source
      if (result?.shouldStop) {
        userStopped = true;
        stopped = true;
      }
    } catch (e) {
      console.error("Stream error: reasoning flush failed", e);
    }
  };

  // Periodic flush for batched content (stop check happens in the mutations themselves)
  const periodicFlush = setInterval(async () => {
    await flushContent();
    await flushReasoning();
  }, DEFAULT_STREAM_CONFIG.BATCH_TIMEOUT);

  const stopAll = async () => {
    if (stopped && !userStopped) return; // Already stopped for other reasons
    stopped = true;
    clearInterval(periodicFlush);
    try {
      // Use conditional clearing to prevent race conditions with newer streaming actions.
      // Only clears isStreaming if this message is still the current streaming message.
      await ctx.runMutation(internal.conversations.clearStreamingForMessage, {
        conversationId,
        messageId,
      });
    } catch {}
  };

  // Promote to streaming once first chunk arrives
  let setStreaming = false;

  // Determine if tools will be used (affects experimental_transform)
  const useTools = supportsTools && !!exaApiKey;

  try {
    const genOpts: any = {
      model,
      messages,
      // Only apply smooth stream transform when NOT using tools
      // (may interfere with tool-related chunks)
      ...(useTools
        ? {}
        : {
            // biome-ignore lint/style/useNamingConvention: AI SDK option
            experimental_transform: createSmoothStreamTransform(),
          }),
      ...extraOptions,
    };

    // Add tool calling if supported
    if (useTools) {
      genOpts.tools = {
        webSearch: createWebSearchTool(exaApiKey),
      };
      genOpts.toolChoice = "auto";
      genOpts.stopWhen = stepCountIs(3);
    }

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

        // Handle tool call - set status to searching
        if (chunk.type === "tool-call" && !isSearching) {
          isSearching = true;
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "searching",
          });
        }

        // Handle tool result - extract citations and write immediately
        if (chunk.type === "tool-result") {
          const toolResult = chunk as {
            output?: { success?: boolean; citations?: Citation[] };
          };
          if (toolResult.output?.success && toolResult.output?.citations) {
            citationsFromTools = toolResult.output.citations;
            // Write citations immediately so frontend can render them during streaming
            await ctx.runMutation(internal.messages.internalUpdate, {
              id: messageId,
              citations: citationsFromTools,
            });
          }
          isSearching = false;
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
          // Include citations from tool calls if any
          ...(citationsFromTools.length > 0 ? { citations: citationsFromTools } : {}),
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

    // Drain the full stream to trigger onChunk/onFinish
    // Using fullStream instead of textStream to properly handle multi-step tool calls
    for await (const _ of result.fullStream) {
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
    // If user requested stop, finalize the message with current content
    if (userStopped) {
      try {
        // Check if a retry has been initiated - if so, skip finalization
        // The retry resets the message to "thinking" status with empty content
        const currentMessage = await ctx.runQuery(
          internal.messages.internalGetByIdQuery,
          { id: messageId }
        );
        const hasBeenReset =
          currentMessage?.status === "thinking" && currentMessage?.content === "";

        if (!hasBeenReset) {
          // Flush any remaining content
          await flushReasoning();
          await flushContent();

          // Calculate timing metrics
          const endTime = Date.now();
          const duration = endTime - startTime;
          const timeToFirstTokenMs = firstTokenTime
            ? firstTokenTime - startTime
            : undefined;
          const thinkingDurationMs =
            reasoningStartTime && reasoningEndTime
              ? reasoningEndTime - reasoningStartTime
              : reasoningStartTime
                ? endTime - reasoningStartTime
                : undefined;

          // Finalize with user_stopped reason
          await ctx.runMutation(internal.messages.internalUpdate, {
            id: messageId,
            metadata: {
              finishReason: "user_stopped",
              stopped: true,
              timeToFirstTokenMs,
              thinkingDurationMs,
              duration,
            },
          });
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "done",
          });
        }
      } catch (e) {
        console.error("Stream error: failed to finalize user-stopped message", e);
      }
    }
    await stopAll();
  }
}
