import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeConvexCtx, makeUnauthenticatedCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  checkModelConflictHandler,
  getAvailableModelsHandler,
  getBuiltInModelsHandler,
  getModelByIDHandler,
  getRecentlyUsedModelsHandler,
  getUnavailableModelIdsHandler,
  getUserModelsHandler,
  getUserSelectedModelHandler,
  hasUserModelsHandler,
  removeModelHandler,
  removeUnavailableModelsHandler,
  selectModelHandler,
  toggleModelHandler,
  updateModelAvailabilityHandler,
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
    // Use toMatchObject since hydration adds capability fields
    expect(result[0]).toMatchObject({
      ...mockUserModels[0],
      isAvailable: true,
    });
    expect(result[1]).toMatchObject({
      ...mockUserModels[1],
      isAvailable: true,
    });
    // Verify capabilities are hydrated
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
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

    // Results are hydrated with capabilities from models.dev cache
    expect(result).toHaveLength(mockBuiltInModels.length);
    expect(result[0]).toMatchObject(mockBuiltInModels[0]);
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
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
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve(mockUserModels)),
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

    // Results are hydrated with capabilities from models.dev cache
    expect(result).toHaveLength(2);
    // Check user model is included (by _id match)
    expect(result.find(m => m._id === mockUserModels[0]._id)).toMatchObject(
      mockUserModels[0]
    );
    // Check non-conflicting built-in is included (by _id match)
    expect(result.find(m => m._id === mockBuiltInModels[0]._id)).toMatchObject(
      mockBuiltInModels[0]
    );
    // Check conflicting built-in is excluded (check by _id since modelId matches user model)
    expect(
      result.find(m => m._id === mockBuiltInModels[1]._id)
    ).toBeUndefined();
    // Verify hydration
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
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
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve([])),
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

    // Results are hydrated with capabilities from models.dev cache
    expect(result).toHaveLength(mockBuiltInModels.length);
    expect(result[0]).toMatchObject(mockBuiltInModels[0]);
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
  });
});

describe("userModels.getBuiltInModels", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      process.env.GEMINI_API_KEY = undefined;
    }
  });

  test("returns empty array when GEMINI_API_KEY is not set", async () => {
    process.env.GEMINI_API_KEY = undefined;

    const ctx = makeConvexCtx({});

    const result = await getBuiltInModelsHandler(ctx as QueryCtx, {});

    expect(result).toEqual([]);
  });

  test("returns active built-in models when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const mockBuiltInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
        name: "Gemini 2.0 Flash",
      },
    ];

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInModels)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getBuiltInModelsHandler(ctx as QueryCtx, {});

    // Results are hydrated with capabilities from models.dev cache
    expect(result).toHaveLength(mockBuiltInModels.length);
    expect(result[0]).toMatchObject(mockBuiltInModels[0]);
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
    expect(ctx.db.query).toHaveBeenCalledWith("builtInModels");
  });

  test("only returns active models", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    await getBuiltInModelsHandler(ctx as QueryCtx, {});

    expect(mockQuery.filter).toHaveBeenCalled();
  });
});

describe("userModels.getModelByID", () => {
  test("returns user model when authenticated and model exists", async () => {
    const userId = "user-123" as Id<"users">;
    const mockUserModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
    };

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(mockUserModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getModelByIDHandler(ctx as QueryCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockUserModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("contextLength");
  });

  test("returns built-in model for anonymous user", async () => {
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
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
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getModelByIDHandler(ctx as QueryCtx, {
      modelId: "gemini-2.0-flash",
      provider: "google",
    });

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockBuiltInModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("contextLength");
  });

  test("returns built-in model when user model not found", async () => {
    const userId = "user-123" as Id<"users">;
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
    };

    let _queryCount = 0;
    const mockUserQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const mockBuiltInQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(mockBuiltInModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          _queryCount++;
          if (table === "userModels") {
            return mockUserQuery;
          }
          if (table === "builtInModels") {
            return mockBuiltInQuery;
          }
          return {};
        }),
      },
    });

    const result = await getModelByIDHandler(ctx as QueryCtx, {
      modelId: "gemini-2.0-flash",
      provider: "google",
    });

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockBuiltInModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("contextLength");
  });

  test("returns null when model not found anywhere", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getModelByIDHandler(ctx as QueryCtx, {
      modelId: "nonexistent",
      provider: "unknown",
    });

    expect(result).toBeNull();
  });
});

describe("userModels.getUserSelectedModel", () => {
  test("returns first built-in model for anonymous user", async () => {
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
    };

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        first: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      first: mock(() => Promise.resolve(mockBuiltInModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserSelectedModelHandler(ctx as QueryCtx, {});

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockBuiltInModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("supportsImages");
    expect(result).toHaveProperty("supportsReasoning");
    expect(result).toHaveProperty("supportsFiles");
    expect(result).toHaveProperty("contextLength");
    expect(result).toHaveProperty("inputModalities");
  });

  test("returns selected user model when one exists", async () => {
    const userId = "user-123" as Id<"users">;
    const mockSelectedModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
      selected: true,
    };

    let _queryCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          _queryCount++;
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockSelectedModel)),
              first: mock(() => Promise.resolve(mockSelectedModel)),
            };
          }
          if (table === "userSettings") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await getUserSelectedModelHandler(ctx as QueryCtx, {});

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockSelectedModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("contextLength");
  });

  test("returns default built-in when user has defaultModelSelected setting", async () => {
    const userId = "user-123" as Id<"users">;
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
    };

    const mockUserSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      defaultModelSelected: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
              first: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "userSettings") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockUserSettings)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(mockBuiltInModel)),
            };
          }
          return {};
        }),
      },
    });

    const result = await getUserSelectedModelHandler(ctx as QueryCtx, {});

    // Result includes hydrated capabilities from models.dev cache
    expect(result).toMatchObject(mockBuiltInModel);
    expect(result).toHaveProperty("supportsTools");
    expect(result).toHaveProperty("contextLength");
  });

  test("returns null when user has models but none selected", async () => {
    const userId = "user-123" as Id<"users">;
    const mockUserModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      selected: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            let callCount = 0;
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)), // No selected model
              first: mock(() => {
                callCount++;
                // First call from parallel queries returns null, second returns the model
                return Promise.resolve(callCount === 1 ? null : mockUserModel);
              }),
            };
          }
          if (table === "userSettings") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await getUserSelectedModelHandler(ctx as QueryCtx, {});

    expect(result).toBeNull();
  });
});

describe("userModels.hasUserModels", () => {
  test("returns true when built-in models exist", async () => {
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      isActive: true,
    };

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        first: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      first: mock(() => Promise.resolve(mockBuiltInModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await hasUserModelsHandler(ctx as QueryCtx, {});

    expect(result).toBe(true);
  });

  test("returns false for anonymous user without built-in models", async () => {
    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        first: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await hasUserModelsHandler(ctx as QueryCtx, {});

    expect(result).toBe(false);
  });

  test("returns true when authenticated user has personal models", async () => {
    const userId = "user-123" as Id<"users">;
    const mockUserModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
    };

    let _queryCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          _queryCount++;
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(mockUserModel)),
            };
          }
          return {};
        }),
      },
    });

    const result = await hasUserModelsHandler(ctx as QueryCtx, {});

    expect(result).toBe(true);
  });

  test("returns false when authenticated user has no models", async () => {
    const userId = "user-123" as Id<"users">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                first: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              first: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await hasUserModelsHandler(ctx as QueryCtx, {});

    expect(result).toBe(false);
  });
});

describe("userModels.toggleModel", () => {
  test("returns error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
    });

    expect(result).toEqual({ success: false, error: "User not authenticated" });
  });

  test("removes existing model when toggled off", async () => {
    const userId = "user-123" as Id<"users">;
    const existingModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
    };

    const deleteMock = mock(() => Promise.resolve());

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(existingModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        delete: deleteMock,
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      modelData: {
        modelId: "gpt-4",
        name: "GPT-4",
        provider: "openai",
        contextLength: 8000,
        supportsImages: false,
        supportsTools: true,
        supportsReasoning: false,
      },
    });

    expect(result).toEqual({ success: true, action: "removed" });
    expect(deleteMock).toHaveBeenCalledWith("userModels", existingModel._id);
  });

  test("returns error when adding model without modelData", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
    });

    expect(result).toEqual({
      success: false,
      error: "Model data required to add model",
    });
  });

  test("returns conflict warning when model conflicts with built-in", async () => {
    const userId = "user-123" as Id<"users">;
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
    };

    let _queryCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          _queryCount++;
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockBuiltInModel)),
            };
          }
          return {};
        }),
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "gemini-2.0-flash",
      modelData: {
        modelId: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "google",
        contextLength: 8000,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
      },
    });

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.conflictingBuiltInModel).toEqual({
      name: "Gemini 2.0 Flash",
      modelId: "gemini-2.0-flash",
      provider: "google",
    });
  });

  test("adds model with acknowledged conflict", async () => {
    const userId = "user-123" as Id<"users">;
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
      name: "Gemini 2.0 Flash",
    };

    const insertMock = mock(() =>
      Promise.resolve("new-model-id" as Id<"userModels">)
    );

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockBuiltInModel)),
            };
          }
          return {};
        }),
        insert: insertMock,
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "gemini-2.0-flash",
      modelData: {
        modelId: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "google",
        contextLength: 8000,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
      },
      acknowledgeConflict: true,
    });

    expect(result).toEqual({
      success: true,
      action: "added",
      overridesBuiltIn: true,
    });
    expect(insertMock).toHaveBeenCalled();
  });

  test("adds new model without conflict", async () => {
    const userId = "user-123" as Id<"users">;
    const insertMock = mock(() =>
      Promise.resolve("new-model-id" as Id<"userModels">)
    );

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
        insert: insertMock,
      },
    });

    const result = await toggleModelHandler(ctx as MutationCtx, {
      modelId: "claude-3",
      modelData: {
        modelId: "claude-3",
        name: "Claude 3",
        provider: "anthropic",
        contextLength: 200000,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
      },
    });

    expect(result).toEqual({
      success: true,
      action: "added",
      overridesBuiltIn: false,
    });
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("userModels.selectModel", () => {
  test("returns undefined for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result).toBeUndefined();
  });

  test("returns undefined for empty modelId", async () => {
    const userId = "user-123" as Id<"users">;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "",
      provider: "openai",
    });

    expect(result).toBeUndefined();
  });

  test("selects built-in model and updates user settings", async () => {
    const userId = "user-123" as Id<"users">;
    const mockBuiltInModel = {
      _id: "builtin-1" as Id<"builtInModels">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      isActive: true,
    };

    const patchMock = mock(() => Promise.resolve());
    const insertMock = mock(() =>
      Promise.resolve("settings-1" as Id<"userSettings">)
    );

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockBuiltInModel)),
            };
          }
          if (table === "userSettings") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
        patch: patchMock,
        insert: insertMock,
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "gemini-2.0-flash",
      provider: "google",
    });

    expect(result).toEqual({
      success: true,
      modelId: "gemini-2.0-flash",
      isDefault: true,
    });
    expect(insertMock).toHaveBeenCalled();
  });

  test("selects user model and deselects previous", async () => {
    const userId = "user-123" as Id<"users">;
    const previousModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-3.5",
      provider: "openai",
      selected: true,
    };
    const newModel = {
      _id: "model-2" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      selected: false,
    };

    const patchMock = mock(() => Promise.resolve());

    let userModelsCallCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            userModelsCallCount++;
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => {
                // First call: check for selected model
                // Second call: find the model to select
                if (userModelsCallCount === 1) {
                  return Promise.resolve(previousModel);
                }
                return Promise.resolve(newModel);
              }),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "userSettings") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
        patch: patchMock,
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result).toEqual({
      success: true,
      modelId: "gpt-4",
      isDefault: false,
    });
    expect(patchMock).toHaveBeenCalledWith("userModels", newModel._id, {
      selected: true,
    });
    expect(patchMock).toHaveBeenCalledWith("userModels", previousModel._id, {
      selected: false,
    });
  });

  test("returns alreadySelected when model is already selected", async () => {
    const userId = "user-123" as Id<"users">;
    const selectedModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      selected: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(selectedModel)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result).toEqual({
      success: true,
      modelId: "gpt-4",
      isDefault: false,
      alreadySelected: true,
    });
  });

  test("returns undefined when user model not found", async () => {
    const userId = "user-123" as Id<"users">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await selectModelHandler(ctx as MutationCtx, {
      modelId: "nonexistent",
      provider: "unknown",
    });

    expect(result).toBeUndefined();
  });
});

describe("userModels.removeModel", () => {
  test("returns error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await removeModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result).toEqual({ success: false, error: "User not authenticated" });
  });

  test("returns error when model not found", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await removeModelHandler(ctx as MutationCtx, {
      modelId: "nonexistent",
      provider: "unknown",
    });

    expect(result).toEqual({ success: false, error: "Model not found" });
  });

  test("removes model and returns details", async () => {
    const userId = "user-123" as Id<"users">;
    const existingModel = {
      _id: "model-1" as Id<"userModels">,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
    };

    const deleteMock = mock(() => Promise.resolve());

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      filter: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        filter: ReturnType<typeof mock>;
        unique: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      unique: mock(() => Promise.resolve(existingModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        delete: deleteMock,
      },
    });

    const result = await removeModelHandler(ctx as MutationCtx, {
      modelId: "gpt-4",
      provider: "openai",
    });

    expect(result).toEqual({
      success: true,
      removedModel: {
        modelId: "gpt-4",
        provider: "openai",
        name: "GPT-4",
      },
    });
    expect(deleteMock).toHaveBeenCalledWith("userModels", existingModel._id);
  });
});

describe("userModels.updateModelAvailability", () => {
  test("returns error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await updateModelAvailabilityHandler(ctx as MutationCtx, {
      availableModelIds: ["gpt-4"],
      provider: "openai",
    });

    expect(result).toEqual({ success: false, error: "User not authenticated" });
  });

  test("updates availability for matching provider models", async () => {
    const userId = "user-123" as Id<"users">;
    const userModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gpt-4",
        provider: "openai",
      },
      {
        _id: "model-2" as Id<"userModels">,
        userId,
        modelId: "gpt-3.5",
        provider: "openai",
      },
      {
        _id: "model-3" as Id<"userModels">,
        userId,
        modelId: "claude-3",
        provider: "anthropic",
      },
    ];

    const patchMock = mock(() => Promise.resolve());

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(userModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    const result = await updateModelAvailabilityHandler(ctx as MutationCtx, {
      availableModelIds: ["gpt-4"],
      provider: "openai",
    });

    expect(result).toEqual({ success: true });
    // Should only update openai models (2 of them)
    expect(patchMock).toHaveBeenCalledTimes(2);
    // gpt-4 should be available
    expect(patchMock).toHaveBeenCalledWith(
      "userModels",
      "model-1",
      expect.objectContaining({ isAvailable: true })
    );
    // gpt-3.5 should be unavailable
    expect(patchMock).toHaveBeenCalledWith(
      "userModels",
      "model-2",
      expect.objectContaining({ isAvailable: false })
    );
  });

  test("does not update models from other providers", async () => {
    const userId = "user-123" as Id<"users">;
    const userModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "claude-3",
        provider: "anthropic",
      },
    ];

    const patchMock = mock(() => Promise.resolve());

    const mockQuery = {
      withIndex: mock(function (this: {
        withIndex: ReturnType<typeof mock>;
        collect: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      collect: mock(() => Promise.resolve(userModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: patchMock,
      },
    });

    const result = await updateModelAvailabilityHandler(ctx as MutationCtx, {
      availableModelIds: ["gpt-4"],
      provider: "openai",
    });

    expect(result).toEqual({ success: true });
    // Should not update anthropic models
    expect(patchMock).not.toHaveBeenCalled();
  });
});

describe("userModels.removeUnavailableModels", () => {
  test("returns error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await removeUnavailableModelsHandler(ctx as MutationCtx, {});

    expect(result).toEqual({ success: false, error: "User not authenticated" });
  });

  test("removes models not in built-in list", async () => {
    const userId = "user-123" as Id<"users">;
    const userModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gemini-2.0-flash",
        provider: "google",
        name: "Gemini 2.0 Flash",
      },
      {
        _id: "model-2" as Id<"userModels">,
        userId,
        modelId: "old-model",
        provider: "deprecated",
        name: "Old Model",
      },
    ];

    const builtInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
      },
    ];

    const deleteMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(userModels)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(builtInModels)),
            };
          }
          return {};
        }),
        delete: deleteMock,
      },
    });

    const result = await removeUnavailableModelsHandler(ctx as MutationCtx, {});

    expect(result).toEqual({
      success: true,
      removedCount: 1,
      removedModels: [
        {
          modelId: "old-model",
          provider: "deprecated",
          name: "Old Model",
        },
      ],
    });
    expect(deleteMock).toHaveBeenCalledWith("userModels", "model-2");
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  test("returns empty list when all models are available", async () => {
    const userId = "user-123" as Id<"users">;
    const userModels = [
      {
        _id: "model-1" as Id<"userModels">,
        userId,
        modelId: "gemini-2.0-flash",
        provider: "google",
        name: "Gemini 2.0 Flash",
      },
    ];

    const builtInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
      },
    ];

    const deleteMock = mock(() => Promise.resolve());

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(userModels)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(builtInModels)),
            };
          }
          return {};
        }),
        delete: deleteMock,
      },
    });

    const result = await removeUnavailableModelsHandler(ctx as MutationCtx, {});

    expect(result).toEqual({
      success: true,
      removedCount: 0,
      removedModels: [],
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("userModels.getRecentlyUsedModels", () => {
  test("returns built-in models for anonymous user", async () => {
    const mockBuiltInModels = [
      {
        _id: "builtin-1" as Id<"builtInModels">,
        modelId: "gemini-2.0-flash",
        provider: "google",
        isActive: true,
        name: "Gemini 2.0 Flash",
      },
    ];

    const mockQuery = {
      filter: mock(function (this: {
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      order: mock(function (this: {
        filter: ReturnType<typeof mock>;
        order: ReturnType<typeof mock>;
        take: ReturnType<typeof mock>;
      }) {
        return this;
      }),
      take: mock(() => Promise.resolve(mockBuiltInModels)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getRecentlyUsedModelsHandler(ctx as QueryCtx, {});

    // Results are hydrated with capabilities from models.dev cache
    expect(result).toHaveLength(mockBuiltInModels.length);
    expect(result[0]).toMatchObject(mockBuiltInModels[0]);
    expect(result[0]).toHaveProperty("supportsTools");
    expect(result[0]).toHaveProperty("contextLength");
  });

  test("returns recently used models for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-1" as Id<"conversations">;

    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId,
        role: "assistant",
        model: "gpt-4",
        provider: "openai",
        createdAt: 1000,
      },
    ];

    const mockConversations = [
      {
        _id: conversationId,
        userId,
      },
    ];

    const mockUserModel = {
      _id: "model-1" as Id<"userModels">,
      _creationTime: 500,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
      contextLength: 8000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
    };

    let _tableQueryCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          _tableQueryCount++;
          if (table === "messages") {
            return {
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
          }
          if (table === "conversations") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(mockConversations)),
            };
          }
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockUserModel)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await getRecentlyUsedModelsHandler(ctx as QueryCtx, {
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe("gpt-4");
    expect(result[0].provider).toBe("openai");
    expect(result[0].lastUsed).toBe(1000);
  });

  test("deduplicates models by modelId and provider", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationId = "conv-1" as Id<"conversations">;

    // Two messages with the same model
    const mockMessages = [
      {
        _id: "msg-1" as Id<"messages">,
        conversationId,
        role: "assistant",
        model: "gpt-4",
        provider: "openai",
        createdAt: 2000,
      },
      {
        _id: "msg-2" as Id<"messages">,
        conversationId,
        role: "assistant",
        model: "gpt-4",
        provider: "openai",
        createdAt: 1000,
      },
    ];

    const mockConversations = [
      {
        _id: conversationId,
        userId,
      },
    ];

    const mockUserModel = {
      _id: "model-1" as Id<"userModels">,
      _creationTime: 500,
      userId,
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
      contextLength: 8000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(table => {
          if (table === "messages") {
            return {
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
          }
          if (table === "conversations") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                collect: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              collect: mock(() => Promise.resolve(mockConversations)),
            };
          }
          if (table === "userModels") {
            return {
              withIndex: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              filter: mock(function (this: {
                withIndex: ReturnType<typeof mock>;
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(mockUserModel)),
            };
          }
          if (table === "builtInModels") {
            return {
              filter: mock(function (this: {
                filter: ReturnType<typeof mock>;
                unique: ReturnType<typeof mock>;
              }) {
                return this;
              }),
              unique: mock(() => Promise.resolve(null)),
            };
          }
          return {};
        }),
      },
    });

    const result = await getRecentlyUsedModelsHandler(ctx as QueryCtx, {
      limit: 10,
    });

    // Should only return one model despite two messages
    expect(result).toHaveLength(1);
    // Should use the most recent timestamp
    expect(result[0].lastUsed).toBe(2000);
  });

  test("respects limit parameter", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
      db: {
        query: mock(() => ({
          filter: mock(function (this: {
            filter: ReturnType<typeof mock>;
            order: ReturnType<typeof mock>;
            take: ReturnType<typeof mock>;
          }) {
            return this;
          }),
          order: mock(function (this: {
            filter: ReturnType<typeof mock>;
            order: ReturnType<typeof mock>;
            take: ReturnType<typeof mock>;
          }) {
            return this;
          }),
          take: mock((limit: number) => {
            expect(limit).toBeLessThanOrEqual(5); // For anonymous users, capped at 5
            return Promise.resolve([]);
          }),
        })),
      },
    });

    await getRecentlyUsedModelsHandler(ctx as QueryCtx, { limit: 3 });
  });
});
