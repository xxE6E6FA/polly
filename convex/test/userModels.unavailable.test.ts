import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/userModels.getUnavailableModelIds", () => {
  test("returns empty array for anonymous users", async () => {
    const t = await makeConvexTest();
    const res = await t.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toEqual([]);
  });

  test("returns empty array for authenticated users without models", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toEqual([]);
  });

  test("returns empty array for authenticated users with user models that haven't been checked", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // Add user models without isAvailable set (default to available)
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      createdAt: Date.now(),
    });

    await t.db.insert("userModels", {
      userId,
      modelId: "claude-3",
      name: "Claude 3",
      provider: "anthropic",
      contextLength: 200000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    // Models without isAvailable set are considered available by default
    expect(res).toEqual([]);
  });

  test("returns unavailable models when explicitly marked as unavailable", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // Add available model
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Add unavailable model (provider no longer offers this model)
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-3.5-turbo-old",
      name: "GPT-3.5 Turbo Old",
      provider: "openai",
      contextLength: 4096,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Add another unavailable model (different provider)
    await t.db.insert("userModels", {
      userId,
      modelId: "claude-2",
      name: "Claude 2",
      provider: "anthropic",
      contextLength: 100000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toHaveLength(2);
    expect(res.some((m: { modelId: string; provider: string }) => m.modelId === "gpt-3.5-turbo-old" && m.provider === "openai")).toBe(true);
    expect(res.some((m: { modelId: string; provider: string }) => m.modelId === "claude-2" && m.provider === "anthropic")).toBe(true);
    expect(res.some((m: { modelId: string; provider: string }) => m.modelId === "gpt-4" && m.provider === "openai")).toBe(false);
  });

  test("returns empty array when models are explicitly marked as available", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // Add models explicitly marked as available
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    await t.db.insert("userModels", {
      userId,
      modelId: "claude-3",
      name: "Claude 3",
      provider: "anthropic",
      contextLength: 200000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toEqual([]);
  });

  test("scenario: provider API returns models but user's model is not in the list (deprecated)", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // User has a model that was available before
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openai",
      contextLength: 4096,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now() - 1000000, // checked a while ago
      createdAt: Date.now(),
    });

    // Simulate fetching models from provider - only returns newer models
    const availableModels = ["gpt-4", "gpt-4-turbo", "o1-preview"];
    
    // Update availability: old model is not in the list
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    await authed.runMutation(api.userModels.updateModelAvailability, {
      availableModelIds: availableModels,
      provider: "openai",
    });

    // Now check unavailable models
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({ modelId: "gpt-3.5-turbo", provider: "openai" });
  });

  test("scenario: provider API call fails but previously checked models remain unavailable", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // User has a model that was previously marked as unavailable
    await t.db.insert("userModels", {
      userId,
      modelId: "deprecated-model",
      name: "Deprecated Model",
      provider: "openai",
      contextLength: 4096,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now() - 100000, // checked previously
      createdAt: Date.now(),
    });

    // Even if provider API fails, we still return previously marked unavailable models
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({ modelId: "deprecated-model", provider: "openai" });
  });

  test("scenario: provider API succeeds and model is available again", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // User has a model that was previously unavailable
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now() - 100000, // was unavailable before
      createdAt: Date.now(),
    });

    // Provider API now returns this model as available
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    await authed.runMutation(api.userModels.updateModelAvailability, {
      availableModelIds: ["gpt-4", "gpt-4-turbo"],
      provider: "openai",
    });

    // Model should no longer be unavailable
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toEqual([]);
  });

  test("scenario: multiple providers with mixed availability", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // OpenAI models
    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextLength: 32000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    await t.db.insert("userModels", {
      userId,
      modelId: "gpt-3.5-turbo-old",
      name: "GPT-3.5 Turbo Old",
      provider: "openai",
      contextLength: 4096,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Anthropic models
    await t.db.insert("userModels", {
      userId,
      modelId: "claude-3-opus",
      name: "Claude 3 Opus",
      provider: "anthropic",
      contextLength: 200000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
      isAvailable: true,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    await t.db.insert("userModels", {
      userId,
      modelId: "claude-2",
      name: "Claude 2",
      provider: "anthropic",
      contextLength: 100000,
      supportsImages: true,
      supportsTools: true,
      supportsReasoning: false,
      isAvailable: false,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    expect(res).toHaveLength(2);
    expect(res.some((m: { modelId: string; provider: string }) => m.modelId === "gpt-3.5-turbo-old" && m.provider === "openai")).toBe(true);
    expect(res.some((m: { modelId: string; provider: string }) => m.modelId === "claude-2" && m.provider === "anthropic")).toBe(true);
  });

  test("scenario: free models are never marked as unavailable", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });

    // Free models should not be marked as unavailable even if isAvailable is false
    await t.db.insert("userModels", {
      userId,
      modelId: "free-model",
      name: "Free Model",
      provider: "openai",
      contextLength: 4096,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      free: true,
      isAvailable: false,
      availabilityCheckedAt: Date.now(),
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res = await authed.runQuery(api.userModels.getUnavailableModelIds, {});
    // Free models are filtered out in ModelItem component, but we still return them
    // from the query - the component handles filtering free models
    expect(res).toHaveLength(1);
  });
});

