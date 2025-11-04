import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/userModels.getAvailableModels", () => {
  test("returns built-ins for anonymous and merges with user models without conflicts for authed", async () => {
    const t = await makeConvexTest();
    // Built-ins
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
    await t.db.insert("builtInModels", {
      modelId: "gemini",
      name: "Gemini",
      provider: "google",
      free: true,
      isActive: true,
      contextLength: 128000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: true,
      createdAt: Date.now(),
    });

    // Anonymous: returns built-ins
    const anonRes = await t.runQuery(api.userModels.getAvailableModels, {});
    expect(anonRes).toHaveLength(2);

    // Authed: add a user model that conflicts with built-in (same id+provider) and one unique
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt",
      name: "GPT (user)",
      provider: "openai",
      contextLength: 32000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: false,
      createdAt: Date.now(),
    });
    await t.db.insert("userModels", {
      userId,
      modelId: "llama",
      name: "Llama",
      provider: "meta",
      contextLength: 8000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getAvailableModels, {});
    // Should include user models (2) + non-conflicting built-in (gemini)
    expect(res.some((m: any) => m.modelId === "gpt" && m.provider === "openai" && m.userId)).toBe(true);
    expect(res.some((m: any) => m.modelId === "llama" && m.provider === "meta" && m.userId)).toBe(true);
    expect(res.some((m: any) => m.modelId === "gemini" && m.provider === "google" && m.isActive)).toBe(true);
    // Built-in gpt (openai) should be filtered due to conflict
    expect(res.some((m: any) => m.modelId === "gpt" && m.provider === "openai" && m.isActive)).toBe(false);
  });
});

