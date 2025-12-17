import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  createConversationHandler,
  getForExportHandler,
  getHandler,
  getWithAccessInfoHandler,
  listHandler,
  patchHandler,
  savePrivateConversationHandler,
  searchHandler,
  stopGenerationHandler,
} from "./conversations";

describe("conversations.list", () => {
  test("returns empty array for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
    });

    expect(result).toEqual([]);
  });

  test("lists conversations for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Conversation 1",
        isArchived: false,
        _creationTime: Date.now(),
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Conversation 2",
        isArchived: false,
        _creationTime: Date.now(),
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
      filter: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
    });

    expect(result).toEqual(mockConversations);
    expect(ctx.db.query).toHaveBeenCalledWith("conversations");
  });

  test("filters archived conversations when archivedOnly is true", async () => {
    const userId = "user-123" as Id<"users">;

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
      filter: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
      archivedOnly: true,
    });

    // Verify the by_user_archived index was used for filtering
    expect(mockQuery.withIndex).toHaveBeenCalledWith(
      "by_user_archived",
      expect.any(Function)
    );
  });

  test("excludes archived conversations when includeArchived is false", async () => {
    const userId = "user-123" as Id<"users">;

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
      filter: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
      includeArchived: false,
    });

    // Verify the by_user_archived index was used for filtering
    expect(mockQuery.withIndex).toHaveBeenCalledWith(
      "by_user_archived",
      expect.any(Function)
    );
  });

  test("uses pagination when paginationOpts provided", async () => {
    const userId = "user-123" as Id<"users">;

    const mockPaginationResult = {
      page: [],
      isDone: true,
      continueCursor: null,
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
      filter: mock(function () {
        return this;
      }),
      paginate: mock(() => Promise.resolve(mockPaginationResult)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10 },
    });

    expect(result).toEqual(mockPaginationResult);
    expect(mockQuery.paginate).toHaveBeenCalled();
  });
});

describe("conversations.search", () => {
  test("returns empty array for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "test",
    });

    expect(result).toEqual([]);
  });

  test("returns empty array for empty search query", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "",
    });

    expect(result).toEqual([]);
  });

  test("returns empty array for whitespace-only search query", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "   ",
    });

    expect(result).toEqual([]);
  });

  test("finds conversations by title match", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Test Conversation",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Other Chat",
        isArchived: false,
        updatedAt: 2000,
      },
    ];

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId: "conv-1" as Id<"conversations">,
        content: "Hello",
      },
      {
        _id: "msg-2" as Id<"messages">,
        conversationId: "conv-2" as Id<"conversations">,
        content: "World",
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const mockMsgQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "conversations") {
            return mockConvQuery;
          }
          if (table === "messages") {
            return mockMsgQuery;
          }
          return {};
        }),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "test",
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("conv-1");
  });

  test("finds conversations by message content match", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "First",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Second",
        isArchived: false,
        updatedAt: 2000,
      },
    ];

    const mockMessages1 = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId: "conv-1" as Id<"conversations">,
        content: "Regular message",
      },
    ];

    const mockMessages2 = [
      {
        _id: "msg-2" as Id<"messages">,
        conversationId: "conv-2" as Id<"conversations">,
        content: "Contains the search term",
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    let callCount = 0;
    const mockMsgQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => {
        // Return different messages for each conversation
        const messages = callCount++ === 0 ? mockMessages1 : mockMessages2;
        return Promise.resolve(messages);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "conversations") {
            return mockConvQuery;
          }
          if (table === "messages") {
            return mockMsgQuery;
          }
          return {};
        }),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "search term",
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("conv-2");
  });

  test("excludes archived conversations when includeArchived is false", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Active Conversation",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Archived Conversation",
        isArchived: true,
        updatedAt: 2000,
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockConvQuery),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "conversation",
      includeArchived: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("conv-1");
  });

  test("includes archived conversations when includeArchived is true", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Active Conversation",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Archived Conversation",
        isArchived: true,
        updatedAt: 2000,
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockConvQuery),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "conversation",
      includeArchived: true,
    });

    expect(result).toHaveLength(2);
  });

  test("dedupes conversations found in both title and message searches", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Test Chat",
        isArchived: false,
        updatedAt: 1000,
      },
    ];

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId: "conv-1" as Id<"conversations">,
        content: "This is a test message",
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const mockMsgQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockMessages)), // Matches by message content
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "conversations") {
            return mockConvQuery;
          }
          if (table === "messages") {
            return mockMsgQuery;
          }
          return {};
        }),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "test",
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("conv-1");
  });

  test("sorts results by updatedAt descending", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Old Conversation",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "New Conversation",
        isArchived: false,
        updatedAt: 3000,
      },
      {
        _id: "conv-3" as Id<"conversations">,
        userId,
        title: "Middle Conversation",
        isArchived: false,
        updatedAt: 2000,
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockConvQuery),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "conversation",
    });

    expect(result).toHaveLength(3);
    expect(result[0]._id).toBe("conv-2"); // Newest
    expect(result[1]._id).toBe("conv-3"); // Middle
    expect(result[2]._id).toBe("conv-1"); // Oldest
  });

  test("respects limit parameter", async () => {
    const userId = "user-123" as Id<"users">;

    const mockConversations = [
      {
        _id: "conv-1" as Id<"conversations">,
        userId,
        title: "Conversation 1",
        isArchived: false,
        updatedAt: 1000,
      },
      {
        _id: "conv-2" as Id<"conversations">,
        userId,
        title: "Conversation 2",
        isArchived: false,
        updatedAt: 2000,
      },
      {
        _id: "conv-3" as Id<"conversations">,
        userId,
        title: "Conversation 3",
        isArchived: false,
        updatedAt: 3000,
      },
    ];

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockConvQuery),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "conversation",
      limit: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0]._id).toBe("conv-3"); // Newest
    expect(result[1]._id).toBe("conv-2");
  });

  test("defaults to limit of 50", async () => {
    const userId = "user-123" as Id<"users">;

    // Create 60 mock conversations
    const mockConversations = Array.from({ length: 60 }, (_, i) => ({
      _id: `conv-${i}` as Id<"conversations">,
      userId,
      title: `Conversation ${i}`,
      isArchived: false,
      updatedAt: i * 100,
    }));

    const mockConvQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockConversations)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockConvQuery),
      },
    });

    const result = await searchHandler(ctx as QueryCtx, {
      searchQuery: "conversation",
    });

    expect(result).toHaveLength(50);
  });
});

describe("conversations.get", () => {
  test("returns conversation when user has access", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isArchived: false,
      _creationTime: Date.now(),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: conversationId });

    expect(result).toEqual(mockConversation);
  });

  test("returns null when user does not have access", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)), // No authenticated user
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: conversationId });

    expect(result).toBeNull();
  });
});

describe("conversations.getWithAccessInfo", () => {
  test("returns conversation with access info for owner", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isArchived: false,
      _creationTime: Date.now(),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
      },
    });

    const result = await getWithAccessInfoHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).toEqual({
      conversation: mockConversation,
      hasAccess: true,
      isDeleted: false,
    });
  });

  test("returns conversation with limited access for non-owner", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const ownerId = "user-owner" as Id<"users">;
    const userId = "user-other" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId: ownerId,
      title: "Test Conversation",
      isArchived: false,
      _creationTime: Date.now(),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
      },
    });

    const result = await getWithAccessInfoHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).toEqual({
      conversation: mockConversation,
      hasAccess: false,
      isDeleted: false,
    });
  });

  test("returns conversation info when conversation not found", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getWithAccessInfoHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).toEqual({
      conversation: null,
      hasAccess: false,
      isDeleted: false,
    });
  });
});

describe("conversations.getForExport", () => {
  test("returns null when user does not have access", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)), // No authenticated user
      },
    });

    const result = await getForExportHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).toBeNull();
  });
});

describe("conversations.patch", () => {
  test("updates conversation fields", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Old Title",
      isArchived: false,
    };

    const updates = {
      title: "New Title",
      isArchived: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await patchHandler(ctx as MutationCtx, {
      id: conversationId,
      updates,
      setUpdatedAt: true,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("conversations", conversationId, {
      ...updates,
      updatedAt: expect.any(Number),
    });
  });

  test("throws error when user is not the owner", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const ownerId = "user-owner" as Id<"users">;
    const userId = "user-other" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId: ownerId,
      title: "Test Conversation",
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
      patchHandler(ctx as MutationCtx, {
        id: conversationId,
        updates: { title: "New Title" },
      })
    ).rejects.toThrow("Access denied");
  });
});

describe("conversations.createConversation", () => {
  test("throws error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      createConversationHandler(ctx as unknown as MutationCtx, {
        firstMessage: "Hello",
      })
    ).rejects.toThrow();
  });

  test("validates user message length", async () => {
    const userId = "user-123" as Id<"users">;
    const mockUser = {
      _id: userId,
      hasUnlimitedCalls: false,
      isAnonymous: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() =>
          Promise.resolve({ subject: userId, tokenIdentifier: userId })
        ),
      },
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    // Message exceeds max length (assuming validation exists)
    const veryLongMessage = "a".repeat(100000);

    await expect(
      createConversationHandler(ctx as unknown as MutationCtx, {
        firstMessage: veryLongMessage,
      })
    ).rejects.toThrow();
  });
});

describe("conversations.savePrivateConversation", () => {
  test("throws error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      savePrivateConversationHandler(ctx as unknown as ActionCtx, {
        messages: [
          {
            role: "user",
            content: "Test message",
            createdAt: Date.now(),
          },
        ],
      })
    ).rejects.toThrow();
  });

  test("throws error for anonymous user", async () => {
    const userId = "user-123" as Id<"users">;
    const mockUser = {
      _id: userId,
      isAnonymous: true,
      name: "Anonymous",
    };

    const mockRunQuery = mock(() => Promise.resolve(mockUser));

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() =>
          Promise.resolve({ subject: userId, tokenIdentifier: userId })
        ),
      },
      runQuery: mockRunQuery,
    });

    await expect(
      savePrivateConversationHandler(ctx as unknown as ActionCtx, {
        messages: [
          {
            role: "user",
            content: "Test message",
            createdAt: Date.now(),
          },
        ],
      })
    ).rejects.toThrow("Anonymous users cannot save private conversations");
  });
});

describe("conversations.stopGeneration", () => {
  test("throws error for unauthenticated user", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      stopGenerationHandler(ctx as MutationCtx, {
        conversationId,
      })
    ).rejects.toThrow("Not authenticated");
  });

  test("throws error when conversation not found", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      stopGenerationHandler(ctx as MutationCtx, {
        conversationId,
      })
    ).rejects.toThrow("Conversation not found");
  });

  test("throws error when user does not own conversation", async () => {
    const userId = "user-123" as Id<"users">;
    const ownerId = "user-owner" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId: ownerId,
      title: "Test Conversation",
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

  test("stops streaming message and updates conversation", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isStreaming: true,
    };

    const mockStreamingMessage = {
      _id: messageId,
      conversationId,
      role: "assistant",
      content: "Partial content",
      status: "streaming",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve([mockStreamingMessage])),
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Should only patch the conversation with stop signal (not the message)
    // The streaming action will finalize the message when it detects stopRequested
    expect(patchMock).toHaveBeenCalledTimes(1);
    const patchCall = patchMock.mock.calls[0] as [
      string,
      Id<"conversations">,
      { isStreaming: boolean; stopRequested: number },
    ];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2].isStreaming).toBe(false);
    expect(typeof patchCall[2].stopRequested).toBe("number");
  });

  test("handles case with no streaming message", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isStreaming: true,
    };

    const mockDoneMessage = {
      _id: "msg-123" as Id<"messages">,
      conversationId,
      role: "assistant",
      content: "Complete content",
      status: "done",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve([mockDoneMessage])),
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Should only patch the conversation with stop signal
    expect(patchMock).toHaveBeenCalledTimes(1);
    const patchCall = patchMock.mock.calls[0] as [
      string,
      Id<"conversations">,
      { isStreaming: boolean; stopRequested: number },
    ];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2].isStreaming).toBe(false);
    expect(typeof patchCall[2].stopRequested).toBe("number");
  });

  test("finds streaming message in thinking status", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isStreaming: true,
    };

    const mockThinkingMessage = {
      _id: messageId,
      conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve([mockThinkingMessage])),
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Should only patch the conversation with stop signal (not the message)
    expect(patchMock).toHaveBeenCalledTimes(1);
    const patchCall = patchMock.mock.calls[0] as [
      string,
      Id<"conversations">,
      { isStreaming: boolean; stopRequested: number },
    ];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2].isStreaming).toBe(false);
    expect(typeof patchCall[2].stopRequested).toBe("number");
  });

  test("ignores user messages when looking for streaming message", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isStreaming: true,
    };

    const mockUserMessage = {
      _id: "msg-123" as Id<"messages">,
      conversationId,
      role: "user",
      content: "User message",
      status: "streaming", // Even if status is streaming, user messages should be ignored
    };

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve([mockUserMessage])),
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    await stopGenerationHandler(ctx as MutationCtx, {
      conversationId,
    });

    // Should only patch the conversation with stop signal (user message ignored)
    expect(patchMock).toHaveBeenCalledTimes(1);
    const patchCall = patchMock.mock.calls[0] as [
      string,
      Id<"conversations">,
      { isStreaming: boolean; stopRequested: number },
    ];
    expect(patchCall[0]).toBe("conversations");
    expect(patchCall[1]).toBe(conversationId);
    expect(patchCall[2].isStreaming).toBe(false);
    expect(typeof patchCall[2].stopRequested).toBe("number");
  });
});

describe("conversations.getForExport - extended", () => {
  test("returns conversation with messages for owner", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
      isArchived: false,
    };

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        _creationTime: 1000,
        conversationId,
        role: "user",
        content: "Hello",
        isMainBranch: true,
        createdAt: 1000,
      },
      {
        _id: "msg-2" as Id<"messages">,
        _creationTime: 2000,
        conversationId,
        role: "assistant",
        content: "Hi there!",
        model: "gpt-4",
        provider: "openai",
        isMainBranch: true,
        createdAt: 2000,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
      },
    });

    const result = await getForExportHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).not.toBeNull();
    expect(result?.conversation).toEqual(mockConversation);
    expect(result?.messages).toHaveLength(2);
    expect(result?.messages[0].content).toBe("Hello");
    expect(result?.messages[1].content).toBe("Hi there!");
  });

  test("respects limit parameter", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
    };

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        _creationTime: 1000,
        conversationId,
        role: "user",
        content: "Message 1",
        isMainBranch: true,
        createdAt: 1000,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
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
      },
    });

    const result = await getForExportHandler(ctx as QueryCtx, {
      id: conversationId,
      limit: 10,
    });

    expect(result).not.toBeNull();
    expect(mockQuery.take).toHaveBeenCalledWith(10);
  });

  test("strips heavy fields from messages for export", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test Conversation",
    };

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        _creationTime: 1000,
        conversationId,
        role: "assistant",
        content: "Response with attachments",
        model: "gpt-4",
        provider: "openai",
        isMainBranch: true,
        createdAt: 1000,
        // Heavy fields that should be stripped
        attachments: [{ type: "image", url: "data:base64..." }],
        metadata: { tokenCount: 100, duration: 500 },
        // Citations should be preserved
        citations: [{ title: "Source", url: "https://example.com" }],
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
      },
    });

    const result = await getForExportHandler(ctx as QueryCtx, {
      id: conversationId,
    });

    expect(result).not.toBeNull();
    const exportedMessage = result?.messages[0];
    // Should have basic fields
    expect(exportedMessage?._id).toBe("msg-1");
    expect(exportedMessage?.content).toBe("Response with attachments");
    expect(exportedMessage?.model).toBe("gpt-4");
    // Should have citations
    expect(exportedMessage?.citations).toEqual([
      { title: "Source", url: "https://example.com" },
    ]);
    // Should NOT have attachments or metadata (stripped for bandwidth)
    expect(
      (exportedMessage as Record<string, unknown>)?.attachments
    ).toBeUndefined();
    expect(
      (exportedMessage as Record<string, unknown>)?.metadata
    ).toBeUndefined();
  });

  test("returns null for invalid conversation ID", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() =>
          Promise.resolve({ subject: "user-123" as Id<"users"> })
        ),
      },
      db: {
        get: mock(() => {
          throw new Error("Invalid ID");
        }),
      },
    });

    const result = await getForExportHandler(ctx as QueryCtx, {
      id: "invalid-id",
    });

    expect(result).toBeNull();
  });
});

describe("conversations.list - extended", () => {
  test("returns empty pagination result for unauthenticated user with pagination", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10 },
    });

    expect(result).toEqual({
      page: [],
      isDone: true,
      continueCursor: null,
    });
  });

  test("uses by_user_recent index when includeArchived is not set", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function () {
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
        query: mock(() => mockQuery),
      },
    });

    await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
    });

    // Should use by_user_recent when not filtering by archived status
    expect(mockQuery.withIndex).toHaveBeenCalledWith(
      "by_user_recent",
      expect.any(Function)
    );
  });

  test("supports ascending sort direction", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function () {
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
        query: mock(() => mockQuery),
      },
    });

    await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
      sortDirection: "asc",
    });

    expect(mockQuery.order).toHaveBeenCalledWith("asc");
  });

  test("defaults to descending sort direction", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function () {
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
        query: mock(() => mockQuery),
      },
    });

    await listHandler(ctx as QueryCtx, {
      paginationOpts: null,
    });

    expect(mockQuery.order).toHaveBeenCalledWith("desc");
  });
});

describe("conversations.get - extended", () => {
  test("returns null when conversation does not exist", async () => {
    const conversationId = "conv-nonexistent" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: conversationId });

    expect(result).toBeNull();
  });

  test("returns null when user does not own conversation", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const ownerId = "user-owner" as Id<"users">;
    const userId = "user-other" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId: ownerId,
      title: "Test Conversation",
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: conversationId });

    expect(result).toBeNull();
  });
});

describe("conversations.patch - extended", () => {
  test("does not set updatedAt when setUpdatedAt is false", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Old Title",
      updatedAt: 1000,
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: patchMock,
      },
    });

    await patchHandler(ctx as MutationCtx, {
      id: conversationId,
      updates: { title: "New Title" },
      setUpdatedAt: false,
    });

    // Should not include updatedAt in patch
    expect(patchMock).toHaveBeenCalledWith("conversations", conversationId, {
      title: "New Title",
    });
  });

  test("ensures monotonic updatedAt when setUpdatedAt is true", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;
    const existingUpdatedAt = Date.now() + 100000; // Future timestamp

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Old Title",
      updatedAt: existingUpdatedAt,
    };

    const patchMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        patch: patchMock,
      },
    });

    await patchHandler(ctx as MutationCtx, {
      id: conversationId,
      updates: { title: "New Title" },
      setUpdatedAt: true,
    });

    // updatedAt should be at least existingUpdatedAt + 1
    const patchCall = patchMock.mock.calls[0];
    const patchedData = patchCall[2] as { updatedAt: number };
    expect(patchedData.updatedAt).toBeGreaterThan(existingUpdatedAt);
  });

  test("throws error for unauthenticated user", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      patchHandler(ctx as MutationCtx, {
        id: conversationId,
        updates: { title: "New Title" },
      })
    ).rejects.toThrow();
  });
});
