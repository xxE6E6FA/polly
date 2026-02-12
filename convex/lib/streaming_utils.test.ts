import { describe, expect, mock, test } from "bun:test";
import type { Id } from "../_generated/dataModel";
import { isConversationStreaming } from "./streaming_utils";
import { makeConvexCtx } from "../../test/convex-ctx";

describe("isConversationStreaming", () => {
  test("returns false when no messages in conversation", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(false);
  });

  test("returns false when latest assistant message has finishReason", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      role: "assistant",
      metadata: { finishReason: "stop" },
      status: "completed",
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(false);
  });

  test("returns false when latest assistant message has stopped flag", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      role: "assistant",
      metadata: { stopped: true },
      status: "completed",
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(false);
  });

  test("returns false when latest assistant message has error status", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      role: "assistant",
      metadata: {},
      status: "error",
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(false);
  });

  test("returns true when latest assistant message is streaming", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      role: "assistant",
      metadata: {},
      status: "streaming",
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(true);
  });

  test("returns true when metadata is null", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      role: "assistant",
      metadata: null,
      status: "streaming",
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await isConversationStreaming(ctx as any, conversationId);
    expect(result).toBe(true);
  });
});

