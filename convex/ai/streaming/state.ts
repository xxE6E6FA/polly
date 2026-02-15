/**
 * Streaming State & Lifecycle
 *
 * Handles streaming initialization (marking conversation as streaming),
 * tool configuration, system prompt injection, stream option building,
 * and user-stop finalization.
 */
import type { LanguageModel, ModelMessage } from "ai";
import { IMAGE_GEN_MARKER } from "../../../shared/constants";
import {
  CITATION_INSTRUCTIONS,
  IMAGE_GENERATION_INSTRUCTIONS,
} from "../../../shared/system-prompts";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { Citation } from "../../types";
import { getUserFriendlyErrorMessage } from "../error_handlers";
import {
  createWebSearchTool,
  createImageGenerationTool,
  type ImageModelInfo,
} from "../tools";
import type { StreamBuffer } from "./buffer";

// ── Types ───────────────────────────────────────────────────────────────

export type StreamingParams = {
  ctx: ActionCtx;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  model: LanguageModel;
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
  // Image generation tool support
  replicateApiKey?: string;
  imageModels?: ImageModelInfo[];
  // AI SDK v6: Telemetry metadata
  userId?: Id<"users">;
  modelId?: string;
  provider?: string;
};

export type ToolConfig = {
  useWebSearch: boolean;
  useImageGen: boolean;
  hasAnyTools: boolean;
};

export type TimingMetrics = {
  startTime: number;
  firstTokenTime: number | undefined;
  reasoningStartTime: number | undefined;
  reasoningEndTime: number | undefined;
  hasReceivedContent: boolean;
};

// ── Initialization ──────────────────────────────────────────────────────

/**
 * Initialize streaming state: mark message as "thinking" and conversation as streaming.
 */
export async function initializeStreaming(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
) {
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
}

// ── Tool Configuration ──────────────────────────────────────────────────

/**
 * Determine which tools are available and inject tool-specific instructions
 * into the first system message.
 *
 * @mutates messages — replaces the system message element in place when tools are enabled.
 */
export function configureTools(
  messages: ModelMessage[],
  supportsTools: boolean,
  exaApiKey: string | undefined,
  replicateApiKey: string | undefined,
  imageModels: ImageModelInfo[],
  messageId: Id<"messages">,
): ToolConfig {
  const useWebSearch = supportsTools && !!exaApiKey;
  const useImageGen =
    supportsTools && !!replicateApiKey && imageModels.length > 0;
  const hasAnyTools = useWebSearch || useImageGen;

  console.log("[streaming_core] Tool configuration:", {
    supportsTools,
    hasExaApiKey: !!exaApiKey,
    useWebSearch,
    useImageGen,
    imageModelCount: imageModels.length,
    messageId,
  });

  // Inject tool-specific instructions into the first system message.
  // This is the single place where tool availability is known, so we co-locate
  // the instructions here rather than plumbing flags through context building.
  if (useWebSearch || useImageGen) {
    const systemIdx = messages.findIndex((m) => m.role === "system");
    if (systemIdx !== -1) {
      const sys = messages[systemIdx] as { role: "system"; content: string };
      let extra = "";
      if (useWebSearch) {
        extra += `\n\n${CITATION_INSTRUCTIONS}`;
      }
      if (useImageGen) {
        extra += `\n\n${IMAGE_GENERATION_INSTRUCTIONS}`;
      }
      messages[systemIdx] = { role: "system", content: sys.content + extra };
    }
  }

  return { useWebSearch, useImageGen, hasAnyTools };
}

/**
 * Build tool-related options for streamText when tools are available.
 */
export function buildToolOptions(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  toolConfig: ToolConfig,
  exaApiKey: string | undefined,
  replicateApiKey: string | undefined,
  imageModels: ImageModelInfo[],
  hasCalledImageGenRef: { value: boolean },
) {
  if (!toolConfig.hasAnyTools) return {};

  const MAX_TOOL_STEPS = 5;
  return {
    tools: {
      ...(toolConfig.useWebSearch
        ? { webSearch: createWebSearchTool(exaApiKey!) }
        : {}),
      ...(toolConfig.useImageGen
        ? {
            generateImage: createImageGenerationTool(
              ctx,
              messageId,
              replicateApiKey!,
              imageModels,
            ),
          }
        : {}),
    },
    toolChoice: "auto",
    // After an image generation, force the model to produce text (no more tool calls).
    // Also caps at MAX_TOOL_STEPS for safety.
    prepareStep: ({ stepNumber }: { stepNumber: number }) => {
      if (hasCalledImageGenRef.value || stepNumber >= MAX_TOOL_STEPS) {
        return { toolChoice: "none" };
      }
      return {};
    },
  };
}

// ── Stream Event Handlers ───────────────────────────────────────────────

/**
 * Handle a tool-call chunk: track the call, flush reasoning, update UI.
 */
export async function handleToolCall(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  chunk: {
    toolCallId: string;
    toolName: string;
    input?: Record<string, unknown>;
  },
  buffer: StreamBuffer,
  hasCalledImageGenRef: { value: boolean },
) {
  if (chunk.toolName === "generateImage") {
    hasCalledImageGenRef.value = true;
    // Insert marker so the frontend knows where to place the image
    // relative to the surrounding text.
    buffer.appendContent(IMAGE_GEN_MARKER);
    await buffer.flush();
  }

  console.log("[streaming_core] Tool call chunk received:", {
    toolCallId: chunk.toolCallId,
    toolName: chunk.toolName,
    input: chunk.input,
  });

  // Flush pending reasoning before starting new segment
  await buffer.flush();
  buffer.advanceSegment();

  // Build args based on tool type
  const toolArgs: Record<string, string | undefined> = {};
  if (chunk.input) {
    if (chunk.toolName === "generateImage") {
      toolArgs.prompt = chunk.input.prompt as string | undefined;
      toolArgs.imageModel = chunk.input.model as string | undefined;
    } else {
      toolArgs.query = chunk.input.query as string | undefined;
      toolArgs.mode = chunk.input.searchMode as string | undefined;
    }
  }

  // Add tool call to message for UI tracking
  try {
    await ctx.runMutation(internal.messages.addToolCall, {
      messageId,
      toolCall: {
        id: chunk.toolCallId,
        name: chunk.toolName,
        status: "running",
        startedAt: Date.now(),
        args: toolArgs,
      },
    });
    console.log("[streaming_core] Tool call added successfully");
  } catch (e) {
    console.error("[streaming_core] Failed to add tool call:", e);
  }

  await ctx.runMutation(internal.messages.updateMessageStatus, {
    messageId,
    status: "searching",
  });
}

/**
 * Handle a tool-result chunk: finalize the tool call, store citations.
 */
export async function handleToolResult(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  chunk: {
    toolCallId: string;
    output?: { success?: boolean; citations?: Citation[] };
  },
  citationsRef: { value: Citation[] },
) {
  console.log("[streaming_core] Tool result chunk received:", {
    toolCallId: chunk.toolCallId,
    success: chunk.output?.success,
    citationsCount: chunk.output?.citations?.length,
  });

  const isSuccess = chunk.output?.success;
  const hasCitations = isSuccess && chunk.output?.citations?.length;
  if (hasCitations) {
    citationsRef.value = chunk.output!.citations!;
  }

  try {
    await ctx.runMutation(internal.messages.finalizeToolResult, {
      messageId,
      toolCallId: chunk.toolCallId,
      toolStatus: isSuccess ? "completed" : "error",
      ...(isSuccess ? {} : { toolError: "Tool call failed" }),
      ...(hasCitations ? { citations: citationsRef.value } : {}),
      messageStatus: "streaming",
    });
  } catch (e) {
    console.error("[streaming_core] Failed to finalize tool result:", e);
  }
}

// ── Finalization ────────────────────────────────────────────────────────

/**
 * Finalize a message that completed successfully.
 */
export async function finalizeSuccess(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  citations: Citation[],
  timing: TimingMetrics,
  finish: {
    finishReason?: string;
    usage?: {
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
      outputTokenDetails?: { reasoningTokens?: number };
      inputTokenDetails?: { cacheReadTokens?: number };
    };
    response?: { id?: string; timestamp?: number | Date };
    warnings?: Array<{
      type: string;
      feature?: string;
      details?: string;
      message?: string;
    }>;
  },
) {
  const endTime = Date.now();
  const duration = endTime - timing.startTime;
  const timeToFirstTokenMs = timing.firstTokenTime
    ? timing.firstTokenTime - timing.startTime
    : undefined;
  const totalTokens = finish.usage?.totalTokens ?? 0;
  const tokensPerSecond =
    duration > 0 ? totalTokens / (duration / 1000) : 0;

  const thinkingDurationMs =
    timing.reasoningStartTime && timing.reasoningEndTime
      ? timing.reasoningEndTime - timing.reasoningStartTime
      : timing.reasoningStartTime
        ? endTime - timing.reasoningStartTime
        : undefined;

  await ctx.runMutation(internal.messages.internalUpdate, {
    id: messageId,
    ...(citations.length > 0 ? { citations } : {}),
    metadata: {
      finishReason: finish.finishReason || "stop",
      tokenUsage:
        finish.usage &&
        finish.usage.totalTokens !== undefined &&
        finish.usage.inputTokens !== undefined &&
        finish.usage.outputTokens !== undefined
          ? {
              inputTokens: finish.usage.inputTokens,
              outputTokens: finish.usage.outputTokens,
              totalTokens: finish.usage.totalTokens,
              reasoningTokens:
                finish.usage.outputTokenDetails?.reasoningTokens ??
                finish.usage.reasoningTokens,
              cachedInputTokens:
                finish.usage.inputTokenDetails?.cacheReadTokens ??
                finish.usage.cachedInputTokens,
            }
          : undefined,
      providerMessageId: finish.response?.id,
      timestamp: finish.response?.timestamp
        ? new Date(finish.response.timestamp as number).toISOString()
        : undefined,
      warnings: finish.warnings
        ?.map((w) => {
          if (w.type === "unsupported") {
            return `Unsupported: ${w.feature}${w.details ? ` - ${w.details}` : ""}`;
          }
          if (w.type === "compatibility") {
            return `Compatibility: ${w.feature}${w.details ? ` - ${w.details}` : ""}`;
          }
          if (w.type === "other") {
            return w.message;
          }
          return String(w);
        })
        .filter((s): s is string => s !== undefined),
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
}

/**
 * Finalize a message that was stopped by the user.
 */
export async function finalizeUserStopped(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  buffer: StreamBuffer,
  timing: TimingMetrics,
) {
  try {
    // Check if a retry has been initiated - if so, skip finalization
    // The retry resets the message to "thinking" status with empty content
    const currentMessage = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      { id: messageId },
    );
    const hasBeenReset =
      currentMessage?.status === "thinking" && currentMessage?.content === "";

    if (!hasBeenReset) {
      // Flush any remaining content
      await buffer.flush();

      const endTime = Date.now();
      const duration = endTime - timing.startTime;
      const timeToFirstTokenMs = timing.firstTokenTime
        ? timing.firstTokenTime - timing.startTime
        : undefined;
      const thinkingDurationMs =
        timing.reasoningStartTime && timing.reasoningEndTime
          ? timing.reasoningEndTime - timing.reasoningStartTime
          : timing.reasoningStartTime
            ? endTime - timing.reasoningStartTime
            : undefined;

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
    console.error(
      "Stream error: failed to finalize user-stopped message",
      e,
    );
  }
}

/**
 * Handle a stream-level error by propagating a user-friendly message.
 */
export async function handleStreamError(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  error: unknown,
) {
  console.error("Stream error in onError callback:", error);
  try {
    const errorMessage = getUserFriendlyErrorMessage(error);
    await ctx.runMutation(internal.messages.updateMessageError, {
      messageId,
      error: errorMessage,
    });
  } catch (updateError) {
    console.error("Failed to update message with error:", updateError);
  }
}
