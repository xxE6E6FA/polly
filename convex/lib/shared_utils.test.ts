import { ConvexError } from "convex/values";
import { describe, expect, mock, test } from "bun:test";
import type { Id } from "../_generated/dataModel";
import {
  ERROR_MESSAGES,
  createDefaultConversationFields,
  createError,
  getAuthenticatedUser,
  getAuthenticatedUserWithData,
  hasConversationAccess,
  validateAuthenticatedUser,
  validateConversationAccess,
  validateMonthlyMessageLimit,
  sanitizeSchema,
  getConversationMessages,
  stopConversationStreaming,
} from "./shared_utils";
import { makeConvexCtx } from "../../test/convex-ctx";

describe("getAuthenticatedUser", () => {
  test("returns userId when authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
    });

    const userId = await getAuthenticatedUser(ctx as any);
    expect(userId).toBe("user-123");
  });

  test("throws ConvexError when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(getAuthenticatedUser(ctx as any)).rejects.toThrow(
      ConvexError
    );
    await expect(getAuthenticatedUser(ctx as any)).rejects.toThrow(
      "User not authenticated"
    );
  });
});

describe("getAuthenticatedUserWithData", () => {
  test("returns userId and user data when authenticated", async () => {
    const mockUser = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      isAnonymous: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await getAuthenticatedUserWithData(ctx as any);
    expect(result.userId).toBe("user-123");
    expect(result.user).toEqual(mockUser);
  });

  test("throws when user not found in database", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(getAuthenticatedUserWithData(ctx as any)).rejects.toThrow(
      "User not found"
    );
  });
});

describe("validateAuthenticatedUser", () => {
  test("returns user when authenticated and found", async () => {
    const mockUser = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      isAnonymous: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const user = await validateAuthenticatedUser(ctx as any);
    expect(user).toEqual(mockUser);
  });

  test("throws when user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(validateAuthenticatedUser(ctx as any)).rejects.toThrow(
      "User not authenticated"
    );
  });
});

describe("hasConversationAccess", () => {
  test("returns true for conversation owner", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test",
      isStreaming: false,
      isArchived: false,
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      first: mock(() => Promise.resolve(null)),
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

    const result = await hasConversationAccess(ctx as any, conversationId);
    expect(result.hasAccess).toBe(true);
    expect(result.conversation).toEqual(mockConversation);
  });

  test("returns false when conversation not found", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await hasConversationAccess(ctx as any, conversationId);
    expect(result.hasAccess).toBe(false);
    expect(result.conversation).toBeNull();
  });

  test("returns true for shared conversation when allowShared is true", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const mockConversation = {
      _id: conversationId,
      userId: "other-user" as Id<"users">,
      title: "Test",
      isStreaming: false,
      isArchived: false,
    };

    const mockSharedConversation = {
      _id: "shared-123" as Id<"sharedConversations">,
      originalConversationId: conversationId,
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockSharedConversation)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        get: mock(() => Promise.resolve(mockConversation)),
        query: mock(() => mockQuery),
      },
    });

    const result = await hasConversationAccess(
      ctx as any,
      conversationId,
      true
    );
    expect(result.hasAccess).toBe(true);
    expect(result.conversation).toEqual(mockConversation);
  });
});

describe("validateConversationAccess", () => {
  test("returns conversation when access is granted", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const userId = "user-123" as Id<"users">;

    const mockConversation = {
      _id: conversationId,
      userId,
      title: "Test",
      isStreaming: false,
      isArchived: false,
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      first: mock(() => Promise.resolve(null)),
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

    const conversation = await validateConversationAccess(
      ctx as any,
      conversationId
    );
    expect(conversation).toEqual(mockConversation);
  });

  test("throws when access is denied", async () => {
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      validateConversationAccess(ctx as any, conversationId)
    ).rejects.toThrow("Access denied");
  });
});

describe("validateMonthlyMessageLimit", () => {
  test("does not throw when under limit", async () => {
    const ctx = makeConvexCtx();
    const user = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      monthlyLimit: 100,
      monthlyMessagesSent: 50,
    };

    await validateMonthlyMessageLimit(ctx as any, user as any);
    // If we get here without throwing, the test passes
    expect(true).toBe(true);
  });

  test("throws when at limit", async () => {
    const ctx = makeConvexCtx();
    const user = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      monthlyLimit: 100,
      monthlyMessagesSent: 100,
    };

    await expect(
      validateMonthlyMessageLimit(ctx as any, user as any)
    ).rejects.toThrow("You've reached your monthly limit of 100 free messages");
  });

  test("throws when over limit", async () => {
    const ctx = makeConvexCtx();
    const user = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      monthlyLimit: 100,
      monthlyMessagesSent: 150,
    };

    await expect(
      validateMonthlyMessageLimit(ctx as any, user as any)
    ).rejects.toThrow("You've reached your monthly limit of 100 free messages");
  });

  test("uses default limit when monthlyLimit is undefined", async () => {
    const ctx = makeConvexCtx();
    const user = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      monthlyMessagesSent: 499, // Under the default 500 limit
    };

    await validateMonthlyMessageLimit(ctx as any, user as any);
    // If we get here without throwing, the test passes
    expect(true).toBe(true);
  });
});

describe("createError", () => {
  test("creates error with USER_NOT_AUTHENTICATED message", () => {
    const error = createError("USER_NOT_AUTHENTICATED");
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.message).toBe(ERROR_MESSAGES.USER_NOT_AUTHENTICATED);
  });

  test("creates error with ACCESS_DENIED message", () => {
    const error = createError("ACCESS_DENIED");
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.message).toBe(ERROR_MESSAGES.ACCESS_DENIED);
  });

  test("creates error with CONVERSATION_NOT_FOUND message", () => {
    const error = createError("CONVERSATION_NOT_FOUND");
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.message).toBe(ERROR_MESSAGES.CONVERSATION_NOT_FOUND);
  });
});

describe("createDefaultConversationFields", () => {
  test("creates default fields with userId", () => {
    const userId = "user-123" as Id<"users">;
    const fields = createDefaultConversationFields(userId);

    expect(fields.userId).toBe(userId);
    expect(fields.title).toBe("New Conversation");
    expect(fields.isStreaming).toBe(false);
    expect(fields.isArchived).toBe(false);
    expect(fields.personaId).toBeUndefined();
    expect(fields.sourceConversationId).toBeUndefined();
  });

  test("includes custom title when provided", () => {
    const userId = "user-123" as Id<"users">;
    const fields = createDefaultConversationFields(userId, {
      title: "Custom Title",
    });

    expect(fields.title).toBe("Custom Title");
  });

  test("includes personaId when provided", () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-456" as Id<"personas">;
    const fields = createDefaultConversationFields(userId, { personaId });

    expect(fields.personaId).toBe(personaId);
  });

  test("includes sourceConversationId when provided", () => {
    const userId = "user-123" as Id<"users">;
    const sourceConversationId = "conv-789" as Id<"conversations">;
    const fields = createDefaultConversationFields(userId, {
      sourceConversationId,
    });

    expect(fields.sourceConversationId).toBe(sourceConversationId);
  });
});

describe("sanitizeSchema", () => {
  test("replaces $ref with _ref in simple object", () => {
    const input = { $ref: "#/definitions/Foo", type: "object" };
    const expected = { _ref: "#/definitions/Foo", type: "object" };
    expect(sanitizeSchema(input)).toEqual(expected);
  });

  test("replaces $ref in nested object", () => {
    const input = { properties: { foo: { $ref: "#/definitions/Foo" } } };
    const expected = { properties: { foo: { _ref: "#/definitions/Foo" } } };
    expect(sanitizeSchema(input)).toEqual(expected);
  });

  test("replaces $ref in array", () => {
    const input = [{ $ref: "#/definitions/Foo" }];
    const expected = [{ _ref: "#/definitions/Foo" }];
    expect(sanitizeSchema(input)).toEqual(expected);
  });

  test("replaces multiple $ keys", () => {
    const input = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: { type: "string" },
        meta: { $ref: "#/definitions/Meta" },
      },
    };
    const expected = {
      _schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: { type: "string" },
        meta: { _ref: "#/definitions/Meta" },
      },
    };
    expect(sanitizeSchema(input)).toEqual(expected);
  });

  test("handles null and non-object values", () => {
    expect(sanitizeSchema(null)).toBeNull();
    expect(sanitizeSchema("string")).toBe("string");
    expect(sanitizeSchema(123)).toBe(123);
  });
});

describe("getConversationMessages", () => {
  test("returns all messages when includeMainBranchOnly is false", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const mockMessages = [{ _id: "msg-1" }, { _id: "msg-2" }];

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      order: mock(function() { return this; }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getConversationMessages(ctx as any, conversationId, false);
    expect(result).toEqual(mockMessages);
  });

  test("filters main branch messages when includeMainBranchOnly is true", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const mockMessages = [{ _id: "msg-1" }];

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      order: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      collect: mock(() => Promise.resolve(mockMessages)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getConversationMessages(ctx as any, conversationId, true);
    expect(result).toEqual(mockMessages);
    expect(mockQuery.filter).toHaveBeenCalled();
  });
});

describe("stopConversationStreaming", () => {
  test("updates conversation and stops assistant message", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        patch: mock(() => Promise.resolve()),
        query: mock(() => mockQuery),
      },
    });

    await stopConversationStreaming(ctx as any, conversationId);

    expect(ctx.db.patch).toHaveBeenCalledWith("conversations", conversationId, {
      isStreaming: false,
    });
    expect(ctx.db.patch).toHaveBeenCalledWith("messages", messageId, {
      status: "done",
      metadata: {
        finishReason: "user_stopped",
        stopped: true,
      },
    });
  });

  test("updates content and reasoning when provided", async () => {
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const mockMessage = {
      _id: messageId,
      role: "assistant",
      metadata: {},
    };

    const mockQuery = {
      withIndex: mock(function() { return this; }),
      filter: mock(function() { return this; }),
      order: mock(function() { return this; }),
      first: mock(() => Promise.resolve(mockMessage)),
    };

    const ctx = makeConvexCtx({
      db: {
        patch: mock(() => Promise.resolve()),
        query: mock(() => mockQuery),
      },
    });

    await stopConversationStreaming(ctx as any, conversationId, {
      content: "Stopped content",
      reasoning: "Stopped reasoning",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("messages", messageId, {
      status: "done",
      content: "Stopped content",
      reasoning: "Stopped reasoning",
      metadata: {
        finishReason: "user_stopped",
        stopped: true,
      },
    });
  });
});

