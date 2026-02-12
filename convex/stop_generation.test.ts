import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { stopGenerationHandler } from "./conversations";

/**
 * stopGeneration tests
 *
 * The stopGeneration mutation uses a pure signal-based approach to avoid OCC conflicts:
 * 1. It sets `isStreaming: false` and `stopRequested: <timestamp>` on the conversation
 * 2. It does NOT read from the messages table (eliminates OCC conflicts)
 * 3. For image generation, it checks `activeImageGeneration` on the conversation
 * 4. The streaming action is responsible for finalizing the message
 */
describe("stopGeneration", () => {
  test("sets stop signal on conversation without reading messages", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
        // NOTE: No query mock - we don't query messages anymore
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Verify conversation was updated with stop signal
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    const patchCall = (ctx.db.patch as ReturnType<typeof mock>).mock.calls[0];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2].isStreaming).toBe(false);
    expect(typeof patchCall[2].stopRequested).toBe("number");
    expect(patchCall[2].stopRequested).toBeGreaterThan(0);
  });

  test("throws if user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      stopGenerationHandler(ctx as MutationCtx, {
        conversationId: "conv-123" as Id<"conversations">,
      })
    ).rejects.toThrow("User not authenticated");
  });

  test("throws if conversation not found", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      stopGenerationHandler(ctx as MutationCtx, {
        conversationId: "conv-123" as Id<"conversations">,
      })
    ).rejects.toThrow("Conversation not found");
  });

  test("throws if user does not own conversation", async () => {
    const userId = "user-123" as Id<"users">;
    const otherUserId = "user-456" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId: otherUserId,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
      },
    });

    await expect(
      stopGenerationHandler(ctx as MutationCtx, {
        conversationId,
      })
    ).rejects.toThrow("Access denied");
  });

  test("does not query messages for text streaming", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const dbQuery = mock(() => {
      throw new Error("Should not query messages");
    });

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
        query: dbQuery,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should NOT query messages - that's the whole point of this fix
    expect(dbQuery).not.toHaveBeenCalled();

    // Should only patch conversation
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    const patchCall = (ctx.db.patch as ReturnType<typeof mock>).mock.calls[0];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
  });

  test("cancels active image generation via conversation tracking", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;
    const replicateId = "replicate-pred-123";

    // Image generation is tracked on conversation, not via message query
    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
      activeImageGeneration: {
        replicateId,
        messageId,
      },
    };

    const schedulerRunAfter = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
        // NOTE: No query mock - we use activeImageGeneration from conversation
      },
      scheduler: {
        runAfter: schedulerRunAfter,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should set stop signal on conversation
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);

    // Should schedule cancel prediction using conversation-level tracking
    expect(schedulerRunAfter).toHaveBeenCalledTimes(1);
    const schedulerCall = schedulerRunAfter.mock.calls[0];
    expect(schedulerCall[2]).toEqual({
      predictionId: replicateId,
      messageId,
    });
  });

  test("does not cancel when no active image generation", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    // No activeImageGeneration on conversation
    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const schedulerRunAfter = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
      scheduler: {
        runAfter: schedulerRunAfter,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should set stop signal but NOT schedule cancellation
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    expect(schedulerRunAfter).not.toHaveBeenCalled();
  });

  test("does not cancel when activeImageGeneration is cleared (already completed)", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    // activeImageGeneration was cleared when image completed
    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: false,
      activeImageGeneration: undefined,
    };

    const schedulerRunAfter = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
      scheduler: {
        runAfter: schedulerRunAfter,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should set stop signal but NOT schedule cancellation
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    expect(schedulerRunAfter).not.toHaveBeenCalled();
  });
});
