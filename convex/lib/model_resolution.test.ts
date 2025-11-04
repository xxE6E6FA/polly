import { describe, test, expect, mock } from "bun:test";
import { mockModuleWithRestore } from "../../src/test/utils";

await mockModuleWithRestore("@convex-dev/auth/server", () => ({
  getAuthUserId: mock(async () => "u1"),
}));
await mockModuleWithRestore(
  import.meta.resolve("./logger"),
  () => ({
    log: {
      debug: mock(),
      info: mock(),
      warn: mock(),
      error: mock(),
      streamStart: mock(),
      streamReasoning: mock(),
      streamComplete: mock(),
      streamError: mock(),
      streamAbort: mock(),
    },
  })
);

import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { getUserEffectiveModel, getUserEffectiveModelWithCapabilities } from "./model_resolution";

describe("lib/model_resolution", () => {

  test("returns provided model/provider when both present", async () => {
    const res = await getUserEffectiveModel({} as any, "m", "p");
    expect(res).toEqual({ modelId: "m", provider: "p" });
  });

  test("resolves from user selected model via db path", async () => {
    const selected = { modelId: "gpt", provider: "openai" };
    const ctx: any = {
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
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

  test("falls back to built-in default when nothing found", async () => {
    const ctx: any = {
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
      db: {
        query: () => ({ withIndex: () => ({ filter: () => ({ unique: async () => null }) }) }),
      },
    };
    const res = await getUserEffectiveModel(ctx);
    expect(res.modelId).toBe(DEFAULT_BUILTIN_MODEL_ID);
    expect(res.provider).toBe("google");
  });

  test("uses action ctx runQuery for selected model and model by id", async () => {
    const selected = { modelId: "m1", provider: "prov" };
    const modelObj = { ...selected, name: "Name", supportsReasoning: true, supportsImages: true } as any;
    const runQuery = mock()
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

  test("db path with built-in model when user model missing", async () => {
    const builtIn = { modelId: "b1", provider: "google", name: "Builtin", supportsReasoning: false, isActive: true } as any;
    const ctx: any = {
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
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
