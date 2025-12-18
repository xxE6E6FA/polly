import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../test/convex-ctx";
import {
  hydrateModelWithCapabilities,
  hydrateModelsWithCapabilities,
  resolveModelCapabilities,
} from "./capability_resolver";

describe("resolveModelCapabilities", () => {
  test("returns capabilities from cache when model exists", async () => {
    const cachedModel = {
      _id: "cache-1",
      provider: "google",
      modelId: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      supportsTools: true,
      supportsReasoning: true,
      supportsAttachments: true,
      inputModalities: ["text", "image", "file"],
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      lastFetched: Date.now(),
      createdAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(cachedModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(
      ctx as any,
      "google",
      "gemini-2.5-flash"
    );

    expect(result.supportsTools).toBe(true);
    expect(result.supportsReasoning).toBe(true);
    expect(result.supportsImages).toBe(true);
    expect(result.supportsFiles).toBe(true);
    expect(result.contextLength).toBe(1048576);
    expect(result.maxOutputTokens).toBe(8192);
    expect(result.inputModalities).toEqual(["text", "image", "file"]);
    expect(result.source).toBe("models.dev");
  });

  test("returns conservative defaults when model not in cache", async () => {
    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(
      ctx as any,
      "unknown-provider",
      "unknown-model"
    );

    expect(result.supportsTools).toBe(false);
    expect(result.supportsReasoning).toBe(false);
    expect(result.supportsImages).toBe(false);
    expect(result.supportsFiles).toBe(false);
    expect(result.contextLength).toBe(4096);
    expect(result.maxOutputTokens).toBeUndefined();
    expect(result.inputModalities).toEqual(["text"]);
    expect(result.source).toBe("unknown");
  });

  test("returns conservative defaults when cache query fails", async () => {
    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.reject(new Error("DB error"))),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(ctx as any, "google", "gemini-2.5-flash");

    expect(result.source).toBe("unknown");
    expect(result.supportsTools).toBe(false);
    expect(result.contextLength).toBe(4096);
  });

  test("derives supportsImages from inputModalities", async () => {
    const cachedModel = {
      _id: "cache-1",
      provider: "openai",
      modelId: "gpt-4o",
      name: "GPT-4o",
      supportsTools: true,
      supportsReasoning: false,
      inputModalities: ["text", "image"],
      contextWindow: 128000,
      lastFetched: Date.now(),
      createdAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(cachedModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(ctx as any, "openai", "gpt-4o");

    expect(result.supportsImages).toBe(true);
  });

  test("uses supportsAttachments for supportsFiles when available", async () => {
    const cachedModel = {
      _id: "cache-1",
      provider: "anthropic",
      modelId: "claude-3-opus",
      name: "Claude 3 Opus",
      supportsTools: true,
      supportsReasoning: false,
      supportsAttachments: true,
      inputModalities: ["text", "image"],
      contextWindow: 200000,
      lastFetched: Date.now(),
      createdAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(cachedModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(
      ctx as any,
      "anthropic",
      "claude-3-opus"
    );

    expect(result.supportsFiles).toBe(true);
  });

  test("falls back to file modality for supportsFiles when supportsAttachments is undefined", async () => {
    const cachedModel = {
      _id: "cache-1",
      provider: "google",
      modelId: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      supportsTools: true,
      supportsReasoning: true,
      // supportsAttachments is undefined
      inputModalities: ["text", "image", "file"],
      contextWindow: 2097152,
      lastFetched: Date.now(),
      createdAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(cachedModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await resolveModelCapabilities(
      ctx as any,
      "google",
      "gemini-2.5-pro"
    );

    expect(result.supportsFiles).toBe(true);
  });
});

describe("hydrateModelWithCapabilities", () => {
  test("merges model reference with resolved capabilities", async () => {
    const cachedModel = {
      _id: "cache-1",
      provider: "openai",
      modelId: "gpt-4o",
      name: "GPT-4o",
      supportsTools: true,
      supportsReasoning: false,
      inputModalities: ["text", "image"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      lastFetched: Date.now(),
      createdAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(() => mockQuery),
      unique: mock(() => Promise.resolve(cachedModel)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const modelRef = {
      modelId: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
      customField: "preserved",
    };

    const result = await hydrateModelWithCapabilities(ctx as any, modelRef);

    // Original fields preserved
    expect(result.modelId).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.name).toBe("GPT-4o");
    expect(result.customField).toBe("preserved");

    // Capabilities merged
    expect(result.supportsTools).toBe(true);
    expect(result.supportsReasoning).toBe(false);
    expect(result.supportsImages).toBe(true);
    expect(result.contextLength).toBe(128000);
    expect(result.maxOutputTokens).toBe(4096);
    expect(result.inputModalities).toEqual(["text", "image"]);
  });
});

describe("hydrateModelsWithCapabilities", () => {
  test("hydrates multiple models in parallel", async () => {
    const cachedModels: Record<string, any> = {
      "google:gemini-2.5-flash": {
        supportsTools: true,
        supportsReasoning: true,
        inputModalities: ["text", "image"],
        contextWindow: 1048576,
      },
      "openai:gpt-4o": {
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ["text", "image"],
        contextWindow: 128000,
      },
    };

    const mockQuery = {
      withIndex: mock((indexName: string, fn: (q: any) => any) => {
        // Return a new mockQuery that captures the filter
        return {
          unique: mock(() => {
            // We can't easily capture the filter args, so return based on call order
            return Promise.resolve(null);
          }),
        };
      }),
    };

    // For simplicity, mock to return defaults (unknown source)
    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const models = [
      { modelId: "gemini-2.5-flash", provider: "google", name: "Gemini 2.5 Flash" },
      { modelId: "gpt-4o", provider: "openai", name: "GPT-4o" },
    ];

    const results = await hydrateModelsWithCapabilities(ctx as any, models);

    expect(results).toHaveLength(2);
    expect(results[0].modelId).toBe("gemini-2.5-flash");
    expect(results[0].provider).toBe("google");
    expect(results[1].modelId).toBe("gpt-4o");
    expect(results[1].provider).toBe("openai");

    // Both should have capability fields
    expect(results[0]).toHaveProperty("supportsTools");
    expect(results[0]).toHaveProperty("supportsImages");
    expect(results[0]).toHaveProperty("contextLength");
    expect(results[1]).toHaveProperty("supportsTools");
    expect(results[1]).toHaveProperty("supportsImages");
    expect(results[1]).toHaveProperty("contextLength");
  });

  test("handles empty array", async () => {
    const ctx = makeConvexCtx();

    const results = await hydrateModelsWithCapabilities(ctx as any, []);

    expect(results).toEqual([]);
  });
});
