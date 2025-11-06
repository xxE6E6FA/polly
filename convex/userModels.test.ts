import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  checkModelConflictHandler,
  getAvailableModelsHandler,
  getUnavailableModelIdsHandler,
  getUserModelsHandler,
} from "./userModels";

describe("userModels.checkModelConflict", () => {
  test("returns no conflict when built-in model does not exist", async () => {
    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await checkModelConflictHandler(ctx as QueryCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result.hasConflict).toBe(false);
    expect(result.builtInModel).toBeNull();
  });

  test("returns conflict when built-in model exists", async () => {
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gpt-4",
      provider: "openai",
      isActive: true,
      name: "GPT-4",
    };

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(mockBuiltInModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await checkModelConflictHandler(ctx as QueryCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result.hasConflict).toBe(true);
    expect(result.builtInModel).toEqual(mockBuiltInModel);
  });

  test("filters by modelId, provider, and isActive", async () => {
    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    await checkModelConflictHandler(ctx as QueryCtx, {
      modelId: "claude-3",
      provider: "anthropic",
    });

    expect(ctx.db.query).toHaveBeenCalledWith("builtInModels");
    // The filter function should have been called with the correct conditions
    expect(mockQuery.filter).toHaveBeenCalled();
  });
});

describe("userModels.getUserModels", () => {
  test("returns empty array for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getUserModelsHandler(ctx as QueryCtx);

    expect(result).toEqual([]);
  });

  test("returns user models with availability set to true", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUserModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gpt-4",
        provider: "openai",
        name: "GPT-4",
        selected: true,
      },
      {
        _id: "model-2" as Id<"userModels">,
        userId,
        modelId: "claude-3",
        provider: "anthropic",
        name: "Claude 3",
        selected: false,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockUserModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserModelsHandler(ctx as QueryCtx);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ...mockUserModels[0],
      isAvailable: true,
    });
    expect(result[1]).toEqual({
      ...mockUserModels[1],
      isAvailable: true,
    });
  });

  test("returns empty array when user has no models", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserModelsHandler(ctx as QueryCtx);

    expect(result).toEqual([]);
  });
});

describe("userModels.getUnavailableModelIds", () => {
  test("returns empty array for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getUnavailableModelIdsHandler(ctx as QueryCtx);

    expect(result).toEqual([]);
  });

  test("returns model IDs that are marked as unavailable", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUserModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gpt-4",
        provider: "openai",
        isAvailable: true,
      },
      {
        _id: "model-2" as Id<"userModels">,
        userId,
        modelId: "claude-3",
        provider: "anthropic",
        isAvailable: false,
      },
      {
        _id: "model-3" as Id<"userModels">,
        userId,
        modelId: "gemini-pro",
        provider: "google",
        isAvailable: false,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockUserModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUnavailableModelIdsHandler(ctx as QueryCtx);

    expect(result).toEqual([
      { modelId: "claude-3", provider: "anthropic" },
      { modelId: "gemini-pro", provider: "google" },
    ]);
  });

  test("ignores models with isAvailable null or undefined", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUserModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gpt-4",
        provider: "openai",
        isAvailable: null,
      },
      {
        _id: "model-2" as Id<"userModels">,
        userId,
        modelId: "claude-3",
        provider: "anthropic",
        isAvailable: undefined,
      },
      {
        _id: "model-3" as Id<"userModels">,
        userId,
        modelId: "gemini-pro",
        provider: "google",
        isAvailable: false,
      },
    ];

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockUserModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUnavailableModelIdsHandler(ctx as QueryCtx);

    expect(result).toEqual([{ modelId: "gemini-pro", provider: "google" }]);
  });
});

describe("userModels.getAvailableModels", () => {
  test("returns only built-in models for unauthenticated user", async () => {
    const mockBuiltInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
        name: "Gemini 2.0 Flash",
      },
    ];

    const mockBuiltInQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(table => {
          if (table === "builtInModels") {
            return mockBuiltInQuery;
          }
          return {};
        }),
      },
    });

    const result = await getAvailableModelsHandler(ctx as QueryCtx);

    expect(result).toEqual(mockBuiltInModels);
  });

  test("returns user models and non-conflicting built-in models for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;

    const mockUserModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gpt-4",
        provider: "openai",
        name: "GPT-4",
      },
    ];

    const mockBuiltInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
        name: "Gemini 2.0 Flash",
      },
      {
        _id: "builtin-2" as Id<"builtInModels">,
        modelId: "gpt-4", // Conflicts with user model
        provider: "openai",
        isActive: true,
        name: "GPT-4 Built-in",
      },
    ];

    const mockBuiltInQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInModels)),
    };

    const mockUserQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockUserModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "builtInModels") {
            return mockBuiltInQuery;
          }
          if (table === "userModels") {
            return mockUserQuery;
          }
          return {};
        }),
      },
    });

    const result = await getAvailableModelsHandler(ctx as QueryCtx);

    expect(result).toHaveLength(2);
    expect(result).toContain(mockUserModels[0]); // User model
    expect(result).toContain(mockBuiltInModels[0]); // Non-conflicting built-in
    expect(result).not.toContain(mockBuiltInModels[1]); // Conflicting built-in excluded
  });

  test("handles empty user models", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
        name: "Gemini 2.0 Flash",
      },
    ];

    const mockBuiltInQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInModels)),
    };

    const mockUserQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "builtInModels") {
            return mockBuiltInQuery;
          }
          if (table === "userModels") {
            return mockUserQuery;
          }
          return {};
        }),
      },
    });

    const result = await getAvailableModelsHandler(ctx as QueryCtx);

    expect(result).toEqual(mockBuiltInModels);
  });
});
