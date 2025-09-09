import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(async () => "u1"),
}));
vi.mock("./logger", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { getUserEffectiveModel, getUserEffectiveModelWithCapabilities } from "./model_resolution";

describe("lib/model_resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns provided model/provider when both present", async () => {
    const res = await getUserEffectiveModel({} as any, "m", "p");
    expect(res).toEqual({ modelId: "m", provider: "p" });
  });

  it("resolves from user selected model via db path", async () => {
    const selected = { modelId: "gpt", provider: "openai" };
    const ctx: any = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            filter: () => ({ unique: async () => (table === "userModels" ? selected : null) }),
          }),
        }),
      },
    };
    const res = await getUserEffectiveModel(ctx);
    expect(res).toEqual(selected);
  });

  it("falls back to built-in default when nothing found", async () => {
    const ctx: any = {
      db: {
        query: () => ({ withIndex: () => ({ filter: () => ({ unique: async () => null }) }) }),
      },
    };
    const res = await getUserEffectiveModel(ctx);
    expect(res.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(res.provider).toBe("google");
  });

  it("uses action ctx runQuery for selected model and model by id", async () => {
    const selected = { modelId: "m1", provider: "prov" };
    const modelObj = { ...selected, name: "Name", supportsReasoning: true, supportsImages: true } as any;
    const runQuery = vi.fn()
      .mockResolvedValueOnce(selected) // getUserSelectedModel
      .mockResolvedValueOnce(modelObj); // getModelByID

    const ctx: any = { runQuery };
    const res1 = await getUserEffectiveModel(ctx);
    expect(res1).toEqual(selected);

    const res2 = await getUserEffectiveModelWithCapabilities(ctx);
    expect(res2.modelId).toBe("m1");
    expect(res2.name).toBe("Name");
    expect(res2.supportsReasoning).toBe(true);
    expect(res2.supportsImages).toBe(true);
  });

  it("db path with built-in model when user model missing", async () => {
    const builtIn = { modelId: "b1", provider: "google", name: "Builtin", supportsReasoning: false, isActive: true } as any;
    const ctx: any = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            filter: (fn: any) => ({
              unique: async () => (table === "userModels" ? null : builtIn),
            }),
          }),
          filter: () => ({ unique: async () => builtIn }),
        }),
      },
    };
    const res = await getUserEffectiveModelWithCapabilities(ctx, "b1", "google");
    expect(res.name).toBe("Builtin");
  });
});

