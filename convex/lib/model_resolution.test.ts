import { describe, expect, mock, test } from "bun:test";
import type { Id } from "../_generated/dataModel";
import { getUserEffectiveModel } from "./model_resolution";
import { makeConvexCtx } from "../../test/convex-ctx";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";

describe("getUserEffectiveModel", () => {
  test("uses provided model and provider directly when both given", async () => {
    const ctx = makeConvexCtx();

    const result = await getUserEffectiveModel(
      ctx as any,
      "gpt-4o",
      "openai"
    );

    expect(result.modelId).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
  });

  test("falls back to user's selected model when not provided", async () => {
    const selectedModel = {
      _id: "model-123" as Id<"userModels">,
      userId: "user-123" as Id<"users">,
      modelId: "claude-3-opus",
      provider: "anthropic",
      selected: true,
      name: "Claude 3 Opus",
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      filter: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(selectedModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe("claude-3-opus");
    expect(result.provider).toBe("anthropic");
  });

  test("uses provided model with selected provider when only model given", async () => {
    const selectedModel = {
      _id: "model-123" as Id<"userModels">,
      userId: "user-123" as Id<"users">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      selected: true,
      name: "Gemini 2.0 Flash",
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      filter: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(selectedModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserEffectiveModel(ctx as any, "gpt-4o");

    expect(result.modelId).toBe("gpt-4o");
    expect(result.provider).toBe("google");
  });

  test("uses selected model with provided provider when only provider given", async () => {
    const selectedModel = {
      _id: "model-123" as Id<"userModels">,
      userId: "user-123" as Id<"users">,
      modelId: "gemini-2.0-flash",
      provider: "google",
      selected: true,
      name: "Gemini 2.0 Flash",
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      filter: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(selectedModel)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserEffectiveModel(
      ctx as any,
      undefined,
      "openai"
    );

    expect(result.modelId).toBe("gemini-2.0-flash");
    expect(result.provider).toBe("openai");
  });

  test("falls back to default model when user has no selected model", async () => {
    const mockQuery = {
      withIndex: mock(() => mockQuery),
      filter: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(result.provider).toBe("google");
  });

  test("falls back to default when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(result.provider).toBe("google");
  });

  test("falls back to default when auth throws error", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.reject(new Error("Auth error"))),
      },
    });

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(result.provider).toBe("google");
  });

  test("handles action context with runQuery", async () => {
    const selectedModel = {
      _id: "model-123" as Id<"userModels">,
      userId: "user-123" as Id<"users">,
      modelId: "claude-3-sonnet",
      provider: "anthropic",
      selected: true,
      name: "Claude 3 Sonnet",
    };

    const ctx = {
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      runQuery: mock(() => Promise.resolve(selectedModel)),
    };

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe("claude-3-sonnet");
    expect(result.provider).toBe("anthropic");
    expect(ctx.runQuery).toHaveBeenCalled();
  });

  test("handles runQuery returning null", async () => {
    const ctx = {
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      runQuery: mock(() => Promise.resolve(null)),
    };

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(result.provider).toBe("google");
  });

  test("handles runQuery throwing error", async () => {
    const ctx = {
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: "user-123" })),
      },
      runQuery: mock(() => Promise.reject(new Error("Query error"))),
    };

    const result = await getUserEffectiveModel(ctx as any);

    expect(result.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(result.provider).toBe("google");
  });
});
