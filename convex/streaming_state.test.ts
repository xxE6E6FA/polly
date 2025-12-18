import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Tests for streaming state management and race condition prevention.
 *
 * The streaming system uses `currentStreamingMessageId` to prevent race conditions:
 * 1. When streaming starts, the message ID is stored in the conversation
 * 2. When streaming ends, `clearStreamingForMessage` only clears if the ID matches
 * 3. This prevents old streaming actions from interfering with new ones
 */

// Import the handler directly to test it
import { clearStreamingForMessageHandler } from "./conversations";

describe("clearStreamingForMessage", () => {
  test("clears streaming state when messageId matches currentStreamingMessageId", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-456" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      isStreaming: true,
      currentStreamingMessageId: messageId,
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId,
    });

    // Verify streaming state was cleared
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    const patchCall = (ctx.db.patch as ReturnType<typeof mock>).mock.calls[0];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2]).toEqual({
      isStreaming: false,
      currentStreamingMessageId: undefined,
      stopRequested: undefined,
    });
  });

  test("does NOT clear streaming state when messageId does not match", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const oldMessageId = "msg-old" as Id<"messages">;
    const newMessageId = "msg-new" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      isStreaming: true,
      currentStreamingMessageId: newMessageId, // A new action has started
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
    });

    // Try to clear with the old message ID
    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId: oldMessageId,
    });

    // Verify patch was NOT called - we should not interfere with the new action
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  test("does NOT clear streaming when currentStreamingMessageId is undefined", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-456" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      isStreaming: true,
      currentStreamingMessageId: undefined, // No message tracking
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId,
    });

    // Verify patch was NOT called - undefined !== messageId
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  test("handles missing conversation gracefully", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-456" as Id<"messages">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
        patch: mock(() => Promise.resolve()),
      },
    });

    // Should not throw
    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId,
    });

    // Verify patch was NOT called
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe("streaming race condition scenarios", () => {
  test("new streaming action takes precedence over old one finishing", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const oldMessageId = "msg-old" as Id<"messages">;
    const newMessageId = "msg-new" as Id<"messages">;

    // Simulate state after new streaming action has started
    const mockConversation = {
      _id: conversationId,
      isStreaming: true,
      currentStreamingMessageId: newMessageId,
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
    });

    // Old action tries to clear - should be ignored
    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId: oldMessageId,
    });
    expect(ctx.db.patch).not.toHaveBeenCalled();

    // New action clears - should work
    await clearStreamingForMessageHandler(ctx as MutationCtx, {
      conversationId,
      messageId: newMessageId,
    });
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
  });
});
