import { ConvexError } from "convex/values";
import { describe, expect, mock, test } from "bun:test";
import type { Id } from "../_generated/dataModel";
import {
  ERROR_MESSAGES,
  createDefaultConversationFields,
  createError,
  getAuthenticatedUser,
  getAuthenticatedUserWithData,
  getOptionalUser,
  hasConversationAccess,
  validateAuthenticatedUser,
  validateConversationAccess,
  validateMonthlyMessageLimit,
  validateOwnership,
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

describe("getOptionalUser", () => {
  test("returns userId when authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
    });

    const userId = await getOptionalUser(ctx as any);
    expect(userId).toBe("user-123");
  });

  test("returns null when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const userId = await getOptionalUser(ctx as any);
    expect(userId).toBeNull();
  });

  test("returns null when auth throws error", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.reject(new Error("Auth error"))),
      },
    });

    const userId = await getOptionalUser(ctx as any);
    expect(userId).toBeNull();
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
    ).rejects.toThrow("Monthly built-in model message limit reached");
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
    ).rejects.toThrow("Monthly built-in model message limit reached");
  });

  test("uses default limit when monthlyLimit is undefined", async () => {
    const ctx = makeConvexCtx();
    const user = {
      _id: "user-123" as Id<"users">,
      _creationTime: Date.now(),
      monthlyMessagesSent: 999,
    };

    await validateMonthlyMessageLimit(ctx as any, user as any);
    // If we get here without throwing, the test passes
    expect(true).toBe(true);
  });
});

describe("validateOwnership", () => {
  test("does not throw when resourceUserId is provided", async () => {
    const ctx = makeConvexCtx();
    const resourceUserId = "user-123" as Id<"users">;

    await validateOwnership(ctx as any, resourceUserId);
    // If we get here without throwing, the test passes
    expect(true).toBe(true);
  });

  test("throws when resourceUserId is undefined", async () => {
    const ctx = makeConvexCtx();

    await expect(
      validateOwnership(ctx as any, undefined as any)
    ).rejects.toThrow("Access denied");
  });

  test("uses custom error message", async () => {
    const ctx = makeConvexCtx();

    await expect(
      validateOwnership(ctx as any, undefined as any, "Custom error")
    ).rejects.toThrow("Custom error");
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
