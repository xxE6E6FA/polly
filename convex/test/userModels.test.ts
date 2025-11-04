import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/userModels.getUserSelectedModel", () => {
  test("anonymous returns first active built-in", async () => {
    const t = await makeConvexTest();
    await t.db.insert("builtInModels", {
      modelId: "gemini-2.5-flash-lite",
      name: "Gemini",
      provider: "google",
      contextLength: 128000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: true,
      free: true,
      isActive: true,
      createdAt: Date.now(),
    });

    const res = await t.runQuery(api.userModels.getUserSelectedModel, {});
    expect(res?.provider).toBe("google");
  });

  test("authenticated returns selected user model when present", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt",
      name: "GPT",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      selected: true,
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUserSelectedModel, {});
    expect(res?.provider).toBe("openai");
  });
});

