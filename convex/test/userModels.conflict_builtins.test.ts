import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/userModels conflict and built-ins", () => {
  it("checkModelConflict detects conflict with active built-in", async () => {
    const t = await makeConvexTest();
    await t.db.insert("builtInModels", {
      modelId: "gpt",
      name: "GPT",
      provider: "openai",
      free: true,
      isActive: true,
      contextLength: 32000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: false,
      createdAt: Date.now(),
    });
    const res = await t.runQuery(api.userModels.checkModelConflict, { modelId: "gpt", provider: "openai" });
    expect(res.hasConflict).toBe(true);
  });

  it("getBuiltInModels returns [] when API key missing", async () => {
    const t = await makeConvexTest();
    const res = await t.runQuery(api.userModels.getBuiltInModels, {});
    expect(Array.isArray(res)).toBe(true);
  });
});

