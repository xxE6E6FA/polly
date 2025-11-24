import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { stopGenerationHandler } from "./conversations";

describe("stopGeneration", () => {
  test("stops streaming message and updates conversation state", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockStreamingMessage = {
      _id: messageId,
      role: "assistant",
      status: "streaming",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockStreamingMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Verify message was updated
    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: {
        finishReason: "user_stopped",
      },
    });

    // Verify conversation was updated
    expect(ctx.db.patch).toHaveBeenCalledWith(conversationId, {
      isStreaming: false,
    });
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
    ).rejects.toThrow("Not authenticated");
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

  test("stops 'thinking' message", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      status: "thinking",
      metadata: {},
      conversationId,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: { finishReason: "user_stopped" },
    });
  });

  test("stops 'pending' message (retry case)", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      status: "pending",
      metadata: {},
      conversationId,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: { finishReason: "user_stopped" },
    });
  });

  test("stops 'searching' message (web search case)", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      status: "searching",
      metadata: {},
      conversationId,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: { finishReason: "user_stopped" },
    });
  });

  test("stops 'reading_pdf' message (PDF processing case)", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      status: "reading_pdf",
      metadata: {},
      conversationId,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: { finishReason: "user_stopped" },
    });
  });

  test("handles no streaming message found gracefully", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should still clear conversation streaming state
    expect(ctx.db.patch).toHaveBeenCalledWith(conversationId, {
      isStreaming: false,
    });
  });

  test("finds correct message when multiple messages exist", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const streamingMessageId = "msg-streaming" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessages = [
      {
        _id: streamingMessageId,
        role: "assistant",
        status: "streaming",
        metadata: {},
      },
      {
        _id: "msg-done" as Id<"messages">,
        role: "assistant",
        status: "done",
        metadata: {},
      },
      {
        _id: "msg-user" as Id<"messages">,
        role: "user",
        status: undefined,
        metadata: {},
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should only stop the streaming message, not the done one
    expect(ctx.db.patch).toHaveBeenCalledWith(streamingMessageId, {
      status: "done",
      metadata: { finishReason: "user_stopped" },
    });
  });

  test("preserves existing metadata when stopping", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const existingMetadata = {
      tokenCount: 100,
      temperature: 0.7,
    };

    const mockConversation = {
      _id: conversationId,
      userId,
      isStreaming: true,
    };

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      status: "streaming",
      metadata: existingMetadata,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([mockMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, { conversationId });

    // Should preserve existing metadata and add finishReason
    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      status: "done",
      metadata: {
        ...existingMetadata,
        finishReason: "user_stopped",
      },
    });
  });
});
