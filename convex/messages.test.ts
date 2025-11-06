import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  createHandler,
  getAlternativesHandler,
  listHandler,
  removeHandler,
  setBranchHandler,
  updateHandler,
} from "./messages";

describe("messages.list", () => {
  test("lists messages for conversation with main branch only", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId,
        role: "user",
        content: "Hello",
        isMainBranch: true,
        attachments: [],
      },
      {
        _id: "msg-2" as Id<"messages">,
        conversationId,
        role: "assistant",
        content: "Hi there",
        isMainBranch: true,
        attachments: [],
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
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      conversationId,
      paginationOpts: null,
    });

    expect(result).toEqual(mockMessages);
    expect(ctx.db.query).toHaveBeenCalledWith("messages");
  });

  test("lists messages including alternatives when includeAlternatives is true", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId,
        role: "user",
        content: "Hello",
        isMainBranch: true,
        attachments: [],
      },
      {
        _id: "msg-2" as Id<"messages">,
        conversationId,
        role: "assistant",
        content: "Hi there",
        isMainBranch: false,
        attachments: [],
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
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      conversationId,
      includeAlternatives: true,
      paginationOpts: null,
    });

    expect(result).toEqual(mockMessages);
  });

  test("resolves attachment URLs when resolveAttachments is true", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      conversationId,
      role: "user",
      content: "Check this file",
      isMainBranch: true,
      attachments: [
        {
          id: "att-1",
          storageId: "storage-123",
          url: null,
        },
      ],
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
      db: {
        query: mock(() => mockQuery),
      },
      storage: {
        getUrl: mock(() => Promise.resolve("https://storage.example.com/file")),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      conversationId,
      paginationOpts: null,
      resolveAttachments: true,
    });

    expect(result[0].attachments[0].url).toBe(
      "https://storage.example.com/file"
    );
    expect(ctx.storage.getUrl).toHaveBeenCalledWith("storage-123");
  });

  test("does not resolve attachments when resolveAttachments is false", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockMessage = {
      _id: "msg-1" as Id<"messages">,
      conversationId,
      role: "user",
      content: "Check this file",
      isMainBranch: true,
      attachments: [
        {
          id: "att-1",
          storageId: "storage-123",
          url: null,
        },
      ],
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
      db: {
        query: mock(() => mockQuery),
      },
      storage: {
        getUrl: mock(() => Promise.resolve("https://storage.example.com/file")),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {
      conversationId,
      paginationOpts: null,
      resolveAttachments: false,
    });

    expect(result[0].attachments[0].url).toBeNull();
    expect(ctx.storage.getUrl).not.toHaveBeenCalled();
  });
});

describe("messages.getAlternatives", () => {
  test("returns messages with matching parentId", async () => {
    const parentId = "msg-parent" as Id<"messages">;

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        parentId,
        content: "Alternative 1",
      },
      {
        _id: "msg-2" as Id<"messages">,
        parentId,
        content: "Alternative 2",
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getAlternativesHandler(ctx as QueryCtx, { parentId });

    expect(result).toEqual(mockMessages);
    expect(ctx.db.query).toHaveBeenCalledWith("messages");
  });

  test("returns empty array when no alternatives exist", async () => {
    const parentId = "msg-parent" as Id<"messages">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getAlternativesHandler(ctx as QueryCtx, { parentId });

    expect(result).toEqual([]);
  });
});

describe("messages.update", () => {
  test("updates message content", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      content: "Old content",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: messageId,
      content: "New content",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      content: "New content",
    });
  });

  test("updates message reasoning", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      reasoning: "Old reasoning",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: messageId,
      reasoning: "New reasoning",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      reasoning: "New reasoning",
    });
  });

  test("uses patch object when provided", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      content: "Old content",
    };

    const patchObj = {
      content: "Patched content",
      reasoning: "Patched reasoning",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: messageId,
      patch: patchObj,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, patchObj);
  });

  test("filters out undefined values", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      content: "Old content",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: messageId,
      content: "New content",
      reasoning: undefined,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      content: "New content",
    });
  });

  test("throws error when message not found", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      updateHandler(ctx as MutationCtx, {
        id: messageId,
        content: "New content",
      })
    ).rejects.toThrow("Message not found");
  });

  test("does not update when no valid fields provided", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      content: "Old content",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: messageId,
      content: undefined,
      reasoning: undefined,
    });

    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe("messages.setBranch", () => {
  test("sets message as main branch without parentId", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      isMainBranch: false,
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => Promise.resolve()),
      },
    });

    const _result = await setBranchHandler(ctx as MutationCtx, {
      messageId,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      isMainBranch: true,
    });
  });

  test("sets message as main branch and marks siblings as not main", async () => {
    const messageId = "msg-1" as Id<"messages">;
    const parentId = "parent-msg" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      conversationId: "conv-1" as Id<"conversations">,
      isMainBranch: false,
    };

    const mockSiblings = [
      {
        _id: "sibling-1" as Id<"messages">,
        parentId,
        isMainBranch: true,
      },
      {
        _id: "sibling-2" as Id<"messages">,
        parentId,
        isMainBranch: true,
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockSiblings)),
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await setBranchHandler(ctx as MutationCtx, {
      messageId,
      parentId,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("sibling-1", {
      isMainBranch: false,
    });
    expect(ctx.db.patch).toHaveBeenCalledWith("sibling-2", {
      isMainBranch: false,
    });
    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      isMainBranch: true,
    });
  });

  test("throws error when message not found", async () => {
    const messageId = "msg-1" as Id<"messages">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      setBranchHandler(ctx as MutationCtx, {
        messageId,
      })
    ).rejects.toThrow("Message not found");
  });
});
