import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../../test/convex-ctx";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  streamingFlushHandler,
  finalizeStreamHandler,
  addToolCallHandler,
  finalizeToolResultHandler,
  appendReasoningSegmentHandler,
} from "./internal_handlers";

// ── Helpers ──────────────────────────────────────────────────────────────

const messageId = "msg-123" as Id<"messages">;
const conversationId = "conv-456" as Id<"conversations">;

function makeMutationCtx(overrides?: Parameters<typeof makeConvexCtx>[0]) {
  return makeConvexCtx(overrides) as unknown as MutationCtx;
}

function makeMessage(overrides?: Record<string, unknown>) {
  return {
    _id: messageId,
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    reasoning: "",
    reasoningParts: [],
    toolCalls: [],
    metadata: {},
    ...overrides,
  };
}

function makeConversation(overrides?: Record<string, unknown>) {
  return {
    _id: conversationId,
    stopRequested: undefined,
    isStreaming: true,
    currentStreamingMessageId: messageId,
    ...overrides,
  };
}

// ── streamingFlushHandler ───────────────────────────────────────────────

describe("streamingFlushHandler", () => {
  test("appends content to existing message content", async () => {
    const msg = makeMessage({ content: "existing " });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const result = await streamingFlushHandler(ctx, {
      messageId,
      appendContent: "new text",
    });

    expect(patch).toHaveBeenCalled();
    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(updates.content).toBe("existing new text");
    expect(result).toEqual({ shouldStop: false });
  });

  test("appends reasoning segment to existing parts", async () => {
    const msg = makeMessage({
      reasoningParts: [{ text: "part1", startedAt: 100 }],
    });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const result = await streamingFlushHandler(ctx, {
      messageId,
      appendReasoning: {
        segmentIndex: 0,
        text: " more",
        startedAt: 100,
      },
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect((updates.reasoningParts as Array<{ text: string }>)[0].text).toBe("part1 more");
    expect(updates.reasoning).toBe("part1 more");
    expect(result).toEqual({ shouldStop: false });
  });

  test("creates new reasoning segment when segmentIndex exceeds parts length", async () => {
    const msg = makeMessage({ reasoningParts: [] });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await streamingFlushHandler(ctx, {
      messageId,
      appendReasoning: {
        segmentIndex: 0,
        text: "new segment",
        startedAt: 200,
      },
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    const parts = updates.reasoningParts as Array<{ text: string; startedAt: number }>;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("new segment");
    expect(parts[0].startedAt).toBe(200);
  });

  test("sets status when provided", async () => {
    const msg = makeMessage();
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await streamingFlushHandler(ctx, {
      messageId,
      appendContent: "x",
      status: "streaming",
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(updates.status).toBe("streaming");
  });

  test("detects stop request from conversation", async () => {
    const msg = makeMessage();
    const conv = makeConversation({ stopRequested: Date.now() });
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch: mock(() => Promise.resolve(undefined)),
      },
    });

    const result = await streamingFlushHandler(ctx, {
      messageId,
      appendContent: "x",
    });

    expect(result).toEqual({ shouldStop: true });
  });

  test("no-op when nothing to flush", async () => {
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({ db: { patch } });

    const result = await streamingFlushHandler(ctx, { messageId });

    expect(patch).not.toHaveBeenCalled();
    expect(result).toEqual({ shouldStop: false });
  });

  test("no-op when message status is error", async () => {
    const msg = makeMessage({ status: "error" });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    const result = await streamingFlushHandler(ctx, {
      messageId,
      appendContent: "should not append",
    });

    expect(patch).not.toHaveBeenCalled();
    expect(result).toEqual({ shouldStop: false });
  });

  test("no-op when message status is done", async () => {
    const msg = makeMessage({ status: "done" });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    const result = await streamingFlushHandler(ctx, {
      messageId,
      appendContent: "should not append",
    });

    expect(patch).not.toHaveBeenCalled();
    expect(result).toEqual({ shouldStop: false });
  });
});

// ── finalizeStreamHandler ───────────────────────────────────────────────

describe("finalizeStreamHandler", () => {
  test("sets status to done with merged metadata", async () => {
    const msg = makeMessage({ metadata: { existing: "value" } });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await finalizeStreamHandler(ctx, {
      messageId,
      conversationId,
      metadata: { finishReason: "stop" } as any,
    });

    // First patch is for message, second for conversation
    const [, , msgUpdates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(msgUpdates.status).toBe("done");
    expect((msgUpdates.metadata as Record<string, unknown>).finishReason).toBe("stop");
    expect((msgUpdates.metadata as Record<string, unknown>).existing).toBe("value");
  });

  test("clears conversation streaming when messageId matches", async () => {
    const msg = makeMessage();
    const conv = makeConversation({ currentStreamingMessageId: messageId });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string, id: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await finalizeStreamHandler(ctx, {
      messageId,
      conversationId,
      metadata: { finishReason: "stop" } as any,
    });

    // Second patch should be conversation clearing
    const [, , convUpdates] = patch.mock.calls[1] as [string, string, Record<string, unknown>];
    expect(convUpdates.isStreaming).toBe(false);
  });

  test("does not clear streaming when messageId does not match", async () => {
    const msg = makeMessage();
    const otherMsgId = "msg-other" as Id<"messages">;
    const conv = makeConversation({
      currentStreamingMessageId: otherMsgId,
      isStreaming: true,
    });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await finalizeStreamHandler(ctx, {
      messageId,
      conversationId,
      metadata: { finishReason: "stop" } as any,
    });

    // Only the message patch should have been called (not conversation)
    expect(patch).toHaveBeenCalledTimes(1);
  });

  test("preserves error status (does not overwrite with done)", async () => {
    const msg = makeMessage({ status: "error" });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await finalizeStreamHandler(ctx, {
      messageId,
      conversationId,
      metadata: { finishReason: "stop" } as any,
    });

    // Message patch should NOT have been called (early return for error)
    // But conversation patch should still happen
    const patchCalls = patch.mock.calls as Array<[string, string, Record<string, unknown>]>;
    const messagePatch = patchCalls.find(([table]) => table === "messages");
    expect(messagePatch).toBeUndefined();
  });

  test("includes citations when provided", async () => {
    const msg = makeMessage();
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const citations = [{ url: "https://example.com", title: "Example" }];
    await finalizeStreamHandler(ctx, {
      messageId,
      conversationId,
      metadata: { finishReason: "stop" } as any,
      citations: citations as any,
    });

    const [, , msgUpdates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(msgUpdates.citations).toEqual(citations);
  });
});

// ── addToolCallHandler ──────────────────────────────────────────────────

describe("addToolCallHandler", () => {
  test("appends tool call to message", async () => {
    const msg = makeMessage({ toolCalls: [] });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    const toolCall = {
      id: "tc-1",
      name: "web_search",
      args: '{"query":"test"}',
      startedAt: 1000,
    };

    await addToolCallHandler(ctx, { messageId, toolCall: toolCall as any });

    expect(patch).toHaveBeenCalledTimes(1);
    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(updates.toolCalls).toEqual([toolCall]);
  });

  test("deduplicates by tool call id", async () => {
    const existingCall = {
      id: "tc-1",
      name: "web_search",
      args: '{"query":"test"}',
      startedAt: 1000,
    };
    const msg = makeMessage({ toolCalls: [existingCall] });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    await addToolCallHandler(ctx, { messageId, toolCall: existingCall as any });

    // Should not patch because tool call already exists
    expect(patch).not.toHaveBeenCalled();
  });

  test("no-op when message not found", async () => {
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
        patch,
      },
    });

    await addToolCallHandler(ctx, {
      messageId,
      toolCall: { id: "tc-1", name: "search", args: "{}" } as any,
    });

    expect(patch).not.toHaveBeenCalled();
  });
});

// ── finalizeToolResultHandler ───────────────────────────────────────────

describe("finalizeToolResultHandler", () => {
  test("updates tool call status to completed", async () => {
    const msg = makeMessage({
      toolCalls: [{ id: "tc-1", name: "web_search", args: "{}", startedAt: 1000 }],
    });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    await finalizeToolResultHandler(ctx, {
      messageId,
      toolCallId: "tc-1",
      toolStatus: "completed",
      messageStatus: "streaming",
    });

    expect(patch).toHaveBeenCalled();
    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    const updatedCalls = updates.toolCalls as Array<Record<string, unknown>>;
    expect(updatedCalls[0].status).toBe("completed");
    expect(updatedCalls[0].completedAt).toBeDefined();
    expect(updates.status).toBe("streaming");
  });

  test("sets error on tool call when toolStatus is error", async () => {
    const msg = makeMessage({
      toolCalls: [{ id: "tc-1", name: "web_search", args: "{}", startedAt: 1000 }],
    });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    await finalizeToolResultHandler(ctx, {
      messageId,
      toolCallId: "tc-1",
      toolStatus: "error",
      toolError: "Something went wrong",
      messageStatus: "streaming",
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    const updatedCalls = updates.toolCalls as Array<Record<string, unknown>>;
    expect(updatedCalls[0].status).toBe("error");
    expect(updatedCalls[0].error).toBe("Something went wrong");
  });

  test("includes citations when provided", async () => {
    const msg = makeMessage({
      toolCalls: [{ id: "tc-1", name: "web_search", args: "{}", startedAt: 1000 }],
    });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(msg)),
        patch,
      },
    });

    const citations = [{ url: "https://example.com", title: "Test" }];
    await finalizeToolResultHandler(ctx, {
      messageId,
      toolCallId: "tc-1",
      toolStatus: "completed",
      citations: citations as any,
      messageStatus: "streaming",
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(updates.citations).toEqual(citations);
  });

  test("no-op when message not found", async () => {
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
        patch,
      },
    });

    await finalizeToolResultHandler(ctx, {
      messageId,
      toolCallId: "tc-1",
      toolStatus: "completed",
      messageStatus: "streaming",
    });

    expect(patch).not.toHaveBeenCalled();
  });
});

// ── appendReasoningSegmentHandler ───────────────────────────────────────

describe("appendReasoningSegmentHandler", () => {
  test("creates new segment when index exceeds parts length", async () => {
    const msg = makeMessage({ reasoningParts: [], conversationId });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const result = await appendReasoningSegmentHandler(ctx, {
      messageId,
      segmentIndex: 0,
      text: "thinking...",
      startedAt: 1000,
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    const parts = updates.reasoningParts as Array<{ text: string; startedAt: number }>;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("thinking...");
    expect(parts[0].startedAt).toBe(1000);
    expect(updates.reasoning).toBe("thinking...");
    expect(result).toEqual({ shouldStop: false });
  });

  test("appends to existing segment", async () => {
    const msg = makeMessage({
      reasoningParts: [{ text: "existing", startedAt: 500 }],
      conversationId,
    });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const result = await appendReasoningSegmentHandler(ctx, {
      messageId,
      segmentIndex: 0,
      text: " more",
      startedAt: 500,
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    const parts = updates.reasoningParts as Array<{ text: string; startedAt: number }>;
    expect(parts[0].text).toBe("existing more");
    expect(parts[0].startedAt).toBe(500); // Preserves original startedAt
    expect(result).toEqual({ shouldStop: false });
  });

  test("syncs flat reasoning string from all segments", async () => {
    const msg = makeMessage({
      reasoningParts: [
        { text: "segment 1", startedAt: 100 },
        { text: "segment 2", startedAt: 200 },
      ],
      conversationId,
    });
    const conv = makeConversation();
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    await appendReasoningSegmentHandler(ctx, {
      messageId,
      segmentIndex: 1,
      text: " extended",
      startedAt: 200,
    });

    const [, , updates] = patch.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(updates.reasoning).toBe("segment 1\n\nsegment 2 extended");
  });

  test("detects stop request", async () => {
    const msg = makeMessage({ reasoningParts: [], conversationId });
    const conv = makeConversation({ stopRequested: Date.now() });
    const patch = mock(() => Promise.resolve(undefined));
    const ctx = makeMutationCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") return Promise.resolve(msg);
          if (table === "conversations") return Promise.resolve(conv);
          return Promise.resolve(null);
        }),
        patch,
      },
    });

    const result = await appendReasoningSegmentHandler(ctx, {
      messageId,
      segmentIndex: 0,
      text: "thinking",
      startedAt: 1000,
    });

    expect(result).toEqual({ shouldStop: true });
  });

  test("returns shouldStop false when message not found", async () => {
    const ctx = makeMutationCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
        patch: mock(() => Promise.resolve(undefined)),
      },
    });

    const result = await appendReasoningSegmentHandler(ctx, {
      messageId,
      segmentIndex: 0,
      text: "thinking",
      startedAt: 1000,
    });

    expect(result).toEqual({ shouldStop: false });
  });
});
