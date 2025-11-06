import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import { createConvexTestInstance } from "../test/convex-test-utils";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  currentHandler,
  getMessageSentCountHandler,
  handleCreateAnonymousUser,
  handleGetUserById,
} from "./users";

// Demonstration of testing Convex functions using convex-test.
// This test auto-skips if convex-test isn't installed yet.

describe("convex: users", () => {
  test("createAnonymous + getById roundtrip", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});
      expect(id).toBeTruthy();

      const user = await t.query(api.users.getById, { id });
      expect(user?.isAnonymous).toBe(true);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });

  test("patch updates user fields", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});
      await t.mutation(api.users.patch, {
        id,
        updates: { name: "Test User", hasUnlimitedCalls: true },
      });
      const user = await t.query(api.users.getById, { id });
      expect(user?.name).toBe("Test User");
      expect(user?.hasUnlimitedCalls).toBe(true);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });

  test("incrementMessage updates counters with monthly flag", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});

      await t.mutation(api.users.incrementMessage, {
        userId: id,
        model: "test",
        provider: "openai",
        countTowardsMonthly: true,
      });

      let user = await t.query(api.users.getById, { id });
      expect(user?.messagesSent).toBe(1);
      expect(user?.monthlyMessagesSent).toBe(1);
      expect(user?.totalMessageCount).toBe(1);

      await t.mutation(api.users.incrementMessage, {
        userId: id,
        model: "test",
        provider: "openai",
        countTowardsMonthly: false,
      });

      user = await t.query(api.users.getById, { id });
      expect(user?.messagesSent).toBe(2);
      expect(user?.monthlyMessagesSent).toBe(1);
      expect(user?.totalMessageCount).toBe(2);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });
});

describe("users.current", () => {
  test("returns user data for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUser = {
      _id: userId,
      _creationTime: Date.now(),
      name: "Test User",
      isAnonymous: false,
      messagesSent: 42,
      monthlyMessagesSent: 10,
      totalMessageCount: 42,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await currentHandler(ctx as QueryCtx);

    expect(result).toEqual(mockUser);
  });

  test("returns null for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await currentHandler(ctx as QueryCtx);

    expect(result).toBeNull();
  });
});

describe("users.getById", () => {
  test("returns user data when found", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUser = {
      _id: userId,
      _creationTime: Date.now(),
      name: "Test User",
      isAnonymous: false,
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await handleGetUserById(ctx as QueryCtx, userId);

    expect(result).toEqual(mockUser);
  });

  test("returns null when user not found", async () => {
    const userId = "user-123" as Id<"users">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await handleGetUserById(ctx as QueryCtx, userId);

    expect(result).toBeNull();
  });
});

describe("users.getMessageSentCount", () => {
  test("returns message counts for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUser = {
      _id: userId,
      messagesSent: 150,
      monthlyMessagesSent: 25,
      totalMessageCount: 200,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await getMessageSentCountHandler(ctx as QueryCtx);

    expect(result).toEqual({
      messagesSent: 150,
      monthlyMessagesSent: 25,
    });
  });

  test("returns null for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getMessageSentCountHandler(ctx as QueryCtx);

    expect(result).toBeNull();
  });
});

describe("users.createAnonymous", () => {
  test("creates anonymous user and returns ID", async () => {
    const newUserId = "user-456" as Id<"users">;

    const ctx = makeConvexCtx({
      db: {
        insert: mock(() => Promise.resolve(newUserId)),
      },
    });

    const result = await handleCreateAnonymousUser(ctx as MutationCtx);

    expect(result).toBe(newUserId);
    expect(ctx.db.insert).toHaveBeenCalledWith("users", {
      isAnonymous: true,
      createdAt: expect.any(Number),
      messagesSent: 0,
      monthlyMessagesSent: 0,
      conversationCount: 0,
      totalMessageCount: 0,
    });
  });
});
