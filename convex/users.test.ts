import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  currentHandler,
  getMessageSentCountHandler,
  handleGetUserById,
} from "./users";

describe("users.current", () => {
  test("returns user data for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUser = {
      _id: userId,
      _creationTime: Date.now(),
      name: "Test User",
      messagesSent: 42,
      monthlyMessagesSent: 10,
      totalMessageCount: 42,
    };

    // getAuthUserId now looks up user via query chain (byExternalId index)
    const queryChain = {
      withIndex: mock(() => queryChain),
      filter: mock(() => queryChain),
      order: mock(() => queryChain),
      first: mock(() => Promise.resolve(mockUser)),
      unique: mock(() => Promise.resolve(mockUser)),
      collect: mock(() => Promise.resolve([mockUser])),
      take: mock(() => Promise.resolve([mockUser])),
      paginate: mock(() =>
        Promise.resolve({ page: [], isDone: true, continueCursor: "" })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() =>
          Promise.resolve({ subject: "clerk_user_abc" })
        ),
      },
      db: {
        query: mock(() => queryChain),
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await currentHandler(ctx as unknown as QueryCtx);

    expect(result).toEqual(mockUser);
  });

  test("returns null for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await currentHandler(ctx as unknown as QueryCtx);

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
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await handleGetUserById(ctx as unknown as QueryCtx, userId);

    expect(result).toEqual(mockUser);
  });

  test("returns null when user not found", async () => {
    const userId = "user-123" as Id<"users">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await handleGetUserById(ctx as unknown as QueryCtx, userId);

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

    const queryChain = {
      withIndex: mock(() => queryChain),
      filter: mock(() => queryChain),
      order: mock(() => queryChain),
      first: mock(() => Promise.resolve(mockUser)),
      unique: mock(() => Promise.resolve(mockUser)),
      collect: mock(() => Promise.resolve([mockUser])),
      take: mock(() => Promise.resolve([mockUser])),
      paginate: mock(() =>
        Promise.resolve({ page: [], isDone: true, continueCursor: "" })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() =>
          Promise.resolve({ subject: "clerk_user_abc" })
        ),
      },
      db: {
        query: mock(() => queryChain),
        get: mock(() => Promise.resolve(mockUser)),
      },
    });

    const result = await getMessageSentCountHandler(ctx as unknown as QueryCtx);

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

    const result = await getMessageSentCountHandler(ctx as unknown as QueryCtx);

    expect(result).toBeNull();
  });
});
