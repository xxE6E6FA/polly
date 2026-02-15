/**
 * Stream Buffer Management
 *
 * Handles content and reasoning buffer accumulation, serialized flushing
 * (to avoid Convex OCC conflicts), periodic flush scheduling, and stop control.
 *
 * The key constraint: Convex doesn't support concurrent mutations on the same
 * document. If two mutations try to update the same message simultaneously, one
 * will fail with an OCC error. All flushes are serialized through `flushAll()`
 * to prevent this.
 */
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { DEFAULT_STREAM_CONFIG } from "../../lib/shared/stream_utils";

export type FlushDeps = {
  ctx: ActionCtx;
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
};

export type StreamBufferState = {
  stopped: boolean;
  userStopped: boolean;
};

/**
 * Creates a stream buffer manager that handles content/reasoning accumulation
 * and serialized flushing to avoid OCC conflicts.
 */
export function createStreamBuffer(deps: FlushDeps) {
  const { ctx, messageId, conversationId } = deps;

  // Lightweight batching buffers
  let contentBuf = "";
  let reasoningBuf = "";
  let isFlushing = false;

  // Segment tracking for interleaved reasoning/tool-call streams
  let reasoningSegmentIndex = 0;
  let reasoningSegmentStartedAt = 0;

  // Shared stop state
  const state: StreamBufferState = {
    stopped: false,
    userStopped: false,
  };

  // Track pending flush promise to avoid Convex dangling promise warnings
  let pendingFlush: Promise<void> | null = null;

  // Periodic flush scheduling
  let flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // ── Internal flush functions ──────────────────────────────────────────
  // Should only be called via flushAll to avoid OCC conflicts.

  const _flushContentInternal = async () => {
    if (!contentBuf || state.stopped) return;
    const toSend = contentBuf;
    contentBuf = "";
    try {
      const result = await ctx.runMutation(
        internal.messages.updateAssistantContent,
        {
          messageId,
          appendContent: toSend,
        },
      );
      // Check stop signal from mutation - interrupt at the source
      if (result?.shouldStop) {
        state.userStopped = true;
        state.stopped = true;
      }
    } catch (e) {
      console.error("Stream error: content flush failed", e);
    }
  };

  const _flushReasoningInternal = async () => {
    if (!reasoningBuf || state.stopped) return;
    const toSend = reasoningBuf;
    reasoningBuf = "";
    try {
      const result = await ctx.runMutation(
        internal.messages.appendReasoningSegment,
        {
          messageId,
          segmentIndex: reasoningSegmentIndex,
          text: toSend,
          startedAt: reasoningSegmentStartedAt || Date.now(),
        },
      );
      // Check stop signal from mutation - interrupt at the source
      if (result?.shouldStop) {
        state.userStopped = true;
        state.stopped = true;
      }
    } catch (e) {
      console.error("Stream error: reasoning flush failed", e);
    }
  };

  // ── Serialized flush ──────────────────────────────────────────────────
  // Prevents OCC (Optimistic Concurrency Control) conflicts by ensuring
  // only one mutation runs at a time.

  const flushAll = async () => {
    if (isFlushing || state.stopped) return;
    isFlushing = true;
    try {
      await _flushContentInternal();
      await _flushReasoningInternal();
    } finally {
      isFlushing = false;
    }
  };

  // ── Periodic flush scheduling ─────────────────────────────────────────
  // Uses recursive setTimeout to properly await promises.

  const scheduleFlush = () => {
    if (state.stopped) return;
    flushTimeoutId = setTimeout(() => {
      pendingFlush = flushAll().finally(() => {
        pendingFlush = null;
        scheduleFlush();
      });
    }, DEFAULT_STREAM_CONFIG.BATCH_TIMEOUT);
  };

  // Start the periodic flush immediately
  scheduleFlush();

  // ── Stop / cleanup ────────────────────────────────────────────────────

  const stopAll = async () => {
    if (state.stopped && !state.userStopped) return;
    state.stopped = true;
    if (flushTimeoutId) {
      clearTimeout(flushTimeoutId);
      flushTimeoutId = null;
    }
    // Wait for any pending flush to complete
    if (pendingFlush) {
      await pendingFlush;
    }
    try {
      // Use conditional clearing to prevent race conditions with newer streaming actions.
      // Only clears isStreaming if this message is still the current streaming message.
      await ctx.runMutation(internal.conversations.clearStreamingForMessage, {
        conversationId,
        messageId,
      });
    } catch {}
  };

  // ── Public API ────────────────────────────────────────────────────────

  return {
    /** Shared mutable stop state */
    state,

    /** Append text to the content buffer */
    appendContent(text: string) {
      contentBuf += text;
    },

    /** Append text to the reasoning buffer */
    appendReasoning(text: string) {
      reasoningBuf += text;
    },

    /** Current content buffer length */
    get contentLength() {
      return contentBuf.length;
    },

    /** Current reasoning buffer length */
    get reasoningLength() {
      return reasoningBuf.length;
    },

    /** Current reasoning segment index */
    get segmentIndex() {
      return reasoningSegmentIndex;
    },

    /** Whether a reasoning segment start time has been set */
    get hasSegmentStartTime() {
      return reasoningSegmentStartedAt !== 0;
    },

    /** Set the start time for the current reasoning segment */
    setSegmentStartTime(time: number) {
      reasoningSegmentStartedAt = time;
    },

    /** Advance to the next reasoning segment (called when a tool call arrives) */
    advanceSegment() {
      reasoningSegmentIndex++;
      reasoningSegmentStartedAt = 0;
    },

    /**
     * Serialized flush - goes through flushAll to prevent OCC conflicts.
     * Both flushContent and flushReasoning route through here.
     */
    flush: flushAll,

    /** Stop streaming and clean up resources */
    stopAll,
  };
}

export type StreamBuffer = ReturnType<typeof createStreamBuffer>;
