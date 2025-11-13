import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  createBranchHandler,
  getBranchesHandler,
  internalCloneMessagesHandler,
} from "./branches";

describe("branches.internalCloneMessages", () => {
  test("clones messages with correct field mapping", async () => {
    const targetConversationId = "conv-target" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const targetConversation = {
      _id: targetConversationId,
      _creationTime: Date.now(),
      userId,
      title: "Target Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const sourceMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        role: "user",
        content: "Hello",
        status: "done" as const,
        statusText: "Done",
        reasoning: "Thinking...",
        model: "gpt-4",
        provider: "openai",
        reasoningConfig: { enabled: true, effort: "medium" as const },
        parentId: undefined,
        branchId: "branch-1",
        sourceConversationId: "conv-source" as Id<"conversations">,
        useWebSearch: true,
        attachments: [],
        citations: [],
        metadata: { finishReason: "stop" },
        imageGeneration: undefined,
        createdAt: 1000,
        completedAt: 2000,
      },
    ];

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(targetConversation)),
        insert: mock(() => Promise.resolve("new-msg-id" as Id<"messages">)),
      },
    });

    await internalCloneMessagesHandler(ctx as MutationCtx, {
      targetConversationId,
      sourceMessages,
    });

    expect(ctx.db.get).toHaveBeenCalledWith(targetConversationId);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "messages",
      expect.objectContaining({
        conversationId: targetConversationId,
        userId,
        role: "user",
        content: "Hello",
        status: "done",
        statusText: "Done",
        reasoning: "Thinking...",
        model: "gpt-4",
        provider: "openai",
        reasoningConfig: { enabled: true, effort: "medium" },
        parentId: undefined,
        isMainBranch: true,
        branchId: "branch-1",
        sourceConversationId: "conv-source",
        useWebSearch: true,
        attachments: [],
        citations: [],
        metadata: { finishReason: "stop" },
        imageGeneration: undefined,
        createdAt: 1000,
        completedAt: 2000,
      })
    );
  });

  test("handles parent ID mapping for branched messages", async () => {
    const targetConversationId = "conv-target" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const targetConversation = {
      _id: targetConversationId,
      _creationTime: Date.now(),
      userId,
      title: "Target Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const sourceMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        role: "user",
        content: "Hello",
        createdAt: 1000,
      },
      {
        _id: "msg-2" as Id<"messages">,
        role: "assistant",
        content: "Hi there",
        parentId: "msg-1" as Id<"messages">,
        createdAt: 2000,
      },
    ];

    const newMsgId1 = "new-msg-1" as Id<"messages">;
    const newMsgId2 = "new-msg-2" as Id<"messages">;

    let insertCount = 0;
    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(targetConversation)),
        insert: mock(() => {
          insertCount++;
          return Promise.resolve(insertCount === 1 ? newMsgId1 : newMsgId2);
        }),
      },
    });

    await internalCloneMessagesHandler(ctx as MutationCtx, {
      targetConversationId,
      sourceMessages,
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    // Second message should have parentId mapped to new ID
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      2,
      "messages",
      expect.objectContaining({
        parentId: newMsgId1,
      })
    );
  });
});

describe("branches.createBranch", () => {
  test("throws error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      createBranchHandler(ctx as ActionCtx, {
        conversationId: "conv-1" as Id<"conversations">,
        messageId: "msg-1" as Id<"messages">,
      })
    ).rejects.toThrow("Not authenticated");
  });
});

describe("branches.getBranches", () => {
  test("returns branches using rootConversationId", async () => {
    const rootConversationId = "conv-root" as Id<"conversations">;

    const mockBranches = [
      {
        _id: "branch-1" as Id<"conversations">,
        rootConversationId,
        title: "Branch 1",
        createdAt: 2000,
      },
      {
        _id: "branch-2" as Id<"conversations">,
        rootConversationId,
        title: "Branch 2",
        createdAt: 3000,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: typeof mockQuery) {
        return this;
      }),
      order: mock(function (this: typeof mockQuery) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBranches)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getBranchesHandler(ctx as QueryCtx, {
      rootConversationId,
    });

    expect(result).toHaveLength(2);
    expect(result[0]._id).toBe("branch-1");
    expect(mockQuery.withIndex).toHaveBeenCalled();
    expect(mockQuery.order).toHaveBeenCalledWith("asc");
  });

  test("returns root conversation when no branches exist", async () => {
    const rootConversationId = "conv-root" as Id<"conversations">;

    const mockRootConversation = {
      _id: rootConversationId,
      title: "Root Conversation",
      _creationTime: Date.now(),
      userId: "test-user" as Id<"users">,
      updatedAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(function (this: typeof mockQuery) {
        return this;
      }),
      order: mock(function (this: typeof mockQuery) {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
        get: mock(() => Promise.resolve(mockRootConversation)),
      },
    });

    const result = await getBranchesHandler(ctx as QueryCtx, {
      rootConversationId,
    });

    expect(result).toEqual([mockRootConversation]);
    expect(ctx.db.get).toHaveBeenCalledWith(rootConversationId);
  });

  test("returns empty array when no branches and root doesn't exist", async () => {
    const rootConversationId = "conv-root" as Id<"conversations">;

    const mockQuery = {
      withIndex: mock(function (this: typeof mockQuery) {
        return this;
      }),
      order: mock(function (this: typeof mockQuery) {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getBranchesHandler(ctx as QueryCtx, {
      rootConversationId,
    });

    expect(result).toEqual([]);
  });
});
