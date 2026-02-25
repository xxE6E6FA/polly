import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../../test/convex-ctx";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { createStreamBuffer, type FlushDeps } from "./buffer";

// ── Helpers ──────────────────────────────────────────────────────────────

const messageId = "msg-123" as Id<"messages">;
const conversationId = "conv-456" as Id<"conversations">;

function makeDeps(overrides?: Parameters<typeof makeConvexCtx>[0]): FlushDeps {
  const ctx = makeConvexCtx(overrides) as unknown as ActionCtx;
  return { ctx, messageId, conversationId };
}

// Prevent real timers from firing during tests
let originalSetTimeout: typeof setTimeout;
let originalClearTimeout: typeof clearTimeout;

beforeEach(() => {
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  // Replace setTimeout to capture but not fire scheduled callbacks
  // This prevents the periodic flush from interfering with tests
  globalThis.setTimeout = mock((fn: () => void, _ms?: number) => {
    return 999 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = mock((_id: unknown) => {}) as unknown as typeof clearTimeout;
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

// ── Buffer accumulation ─────────────────────────────────────────────────

describe("buffer accumulation", () => {
  test("tracks content buffer length", () => {
    const buf = createStreamBuffer(makeDeps());
    expect(buf.contentLength).toBe(0);

    buf.appendContent("hello");
    expect(buf.contentLength).toBe(5);

    buf.appendContent(" world");
    expect(buf.contentLength).toBe(11);
  });

  test("tracks reasoning buffer length", () => {
    const buf = createStreamBuffer(makeDeps());
    expect(buf.reasoningLength).toBe(0);

    buf.appendReasoning("thinking");
    expect(buf.reasoningLength).toBe(8);

    buf.appendReasoning(" more");
    expect(buf.reasoningLength).toBe(13);
  });
});

// ── Segment tracking ────────────────────────────────────────────────────

describe("segment tracking", () => {
  test("starts at segment index 0", () => {
    const buf = createStreamBuffer(makeDeps());
    expect(buf.segmentIndex).toBe(0);
  });

  test("advances segment index", () => {
    const buf = createStreamBuffer(makeDeps());
    buf.advanceSegment();
    expect(buf.segmentIndex).toBe(1);
    buf.advanceSegment();
    expect(buf.segmentIndex).toBe(2);
  });

  test("resets segment start time on advance", () => {
    const buf = createStreamBuffer(makeDeps());
    buf.setSegmentStartTime(1000);
    expect(buf.hasSegmentStartTime).toBe(true);

    buf.advanceSegment();
    expect(buf.hasSegmentStartTime).toBe(false);
  });

  test("setSegmentStartTime marks hasSegmentStartTime", () => {
    const buf = createStreamBuffer(makeDeps());
    expect(buf.hasSegmentStartTime).toBe(false);
    buf.setSegmentStartTime(Date.now());
    expect(buf.hasSegmentStartTime).toBe(true);
  });
});

// ── Flush ───────────────────────────────────────────────────────────────

describe("flush", () => {
  test("calls ctx.runMutation with content when buffer has content", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("hello");
    await buf.flush();

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, args] = runMutation.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(args.messageId).toBe(messageId);
    expect(args.appendContent).toBe("hello");
    expect(args.appendReasoning).toBeUndefined();
  });

  test("calls ctx.runMutation with reasoning when buffer has reasoning", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.setSegmentStartTime(1000);
    buf.appendReasoning("thinking");
    await buf.flush();

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, args] = runMutation.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(args.appendReasoning).toEqual({
      segmentIndex: 0,
      text: "thinking",
      startedAt: 1000,
    });
  });

  test("includes pending status in flush", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("x");
    buf.setPendingStatus("streaming");
    await buf.flush();

    const [, args] = runMutation.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(args.status).toBe("streaming");
  });

  test("clears buffers after flush", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("hello");
    buf.appendReasoning("thinking");
    await buf.flush();

    expect(buf.contentLength).toBe(0);
    expect(buf.reasoningLength).toBe(0);
  });

  test("no-op when buffers are empty", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    await buf.flush();
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("no-op when already stopped", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.state.stopped = true;
    buf.appendContent("hello");
    await buf.flush();

    expect(runMutation).not.toHaveBeenCalled();
  });
});

// ── Serialization ───────────────────────────────────────────────────────

describe("serialization", () => {
  test("does not overlap flushes", async () => {
    let resolveFlush!: () => void;
    const flushPromise = new Promise<void>(r => { resolveFlush = r; });
    let callCount = 0;

    const runMutation = mock(() => {
      callCount++;
      if (callCount === 1) {
        return flushPromise.then(() => ({ shouldStop: false }));
      }
      return Promise.resolve({ shouldStop: false });
    });

    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("first");
    const p1 = buf.flush();

    // Second flush while first is in progress
    buf.appendContent("second");
    const p2 = buf.flush();

    // Complete the first flush
    resolveFlush();
    await p1;
    await p2;

    // Only the first flush should have gone through because the second
    // was no-op'd while isFlushing was true
    expect(callCount).toBe(1);
  });
});

// ── Stop detection ──────────────────────────────────────────────────────

describe("stop detection", () => {
  test("sets stopped and userStopped when shouldStop is true", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: true }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("hello");
    await buf.flush();

    expect(buf.state.stopped).toBe(true);
    expect(buf.state.userStopped).toBe(true);
  });

  test("does not set stopped when shouldStop is false", async () => {
    const runMutation = mock(() => Promise.resolve({ shouldStop: false }));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    buf.appendContent("hello");
    await buf.flush();

    expect(buf.state.stopped).toBe(false);
    expect(buf.state.userStopped).toBe(false);
  });
});

// ── stopAll ─────────────────────────────────────────────────────────────

describe("stopAll", () => {
  test("sets stopped state and clears timeout", async () => {
    const runMutation = mock(() => Promise.resolve(undefined));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    await buf.stopAll();

    expect(buf.state.stopped).toBe(true);
    expect(globalThis.clearTimeout).toHaveBeenCalled();
  });

  test("calls clearStreamingForMessage mutation", async () => {
    const runMutation = mock(() => Promise.resolve(undefined));
    const deps = makeDeps({ runMutation });
    const buf = createStreamBuffer(deps);

    await buf.stopAll();

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, args] = runMutation.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(args.conversationId).toBe(conversationId);
    expect(args.messageId).toBe(messageId);
  });
});
