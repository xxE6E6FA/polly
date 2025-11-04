import { describe, expect, test } from "bun:test";

import {
  ANTHROPIC_BUDGET_MAP,
  GOOGLE_THINKING_BUDGET_MAP,
  getProviderReasoningConfig,
  getProviderReasoningOptions,
  normalizeReasoningEffort,
} from "./reasoning-config";

describe("reasoning-config (extra)", () => {
  // Note: These tests previously used mock() to mock getModelReasoningInfo,
  // but Bun doesn't support module mocking. Tests now use the real implementation.
  test("returns empty when model does not support reasoning", () => {
    const cfg = getProviderReasoningConfig(
      { provider: "openai", modelId: "gpt", supportsReasoning: false },
      { enabled: true }
    );
    expect(cfg).toEqual({});
  });

  test("enables provider-specific options when special handling needed (no explicit config)", () => {
    // OpenAI => simple flag
    let cfg = getProviderReasoningConfig({
      provider: "openai",
      modelId: "o1-preview",
    });
    expect(cfg).toEqual({ openai: { reasoning: true } });

    // Google => thinking budget uses default for medium
    cfg = getProviderReasoningConfig({
      provider: "google",
      modelId: "gemini-2.5-pro",
    });
    expect(cfg).toMatchObject({
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: GOOGLE_THINKING_BUDGET_MAP["medium"],
          },
        },
      },
    });

    // Anthropic => budgetTokens uses default for medium
    cfg = getProviderReasoningConfig({
      provider: "anthropic",
      modelId: "claude-opus-4",
    });
    expect(cfg).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: ANTHROPIC_BUDGET_MAP["medium"],
        },
      },
    });
  });

  test("maps Groq options with effort and max tokens", () => {
    const cfg: any = getProviderReasoningOptions("groq", {
      effort: "high",
      maxTokens: 1234,
    });
    expect(cfg.providerOptions.groq).toMatchObject({
      reasoningFormat: "parsed",
      reasoningEffort: "high",
      maxOutputTokens: 1234,
      parallelToolCalls: true,
    });

    const low: any = getProviderReasoningOptions("groq", { effort: "low" });
    expect(low.providerOptions.groq.reasoningEffort).toBe("low");
    const def: any = getProviderReasoningOptions("groq", { effort: "medium" });
    expect(def.providerOptions.groq.reasoningEffort).toBe("default");
  });

  test("builds OpenRouter extraBody with effort or default enabled", () => {
    // With explicit effort
    const cfg: any = getProviderReasoningOptions("openrouter", {
      effort: "low",
    });
    expect(cfg.extraBody.reasoning).toMatchObject({
      effort: "low",
      exclude: false,
    });
    expect(cfg.extraBody.reasoning.enabled).toBeUndefined();

    // With no explicit config: exclude is set and enabled defaults to true
    const defCfg: any = getProviderReasoningOptions("openrouter");
    expect(defCfg.extraBody.reasoning).toMatchObject({
      exclude: false,
      enabled: true,
    });
  });

  test("normalizes invalid effort values to medium", () => {
    expect(normalizeReasoningEffort("weird" as any)).toBe("medium");
    expect(normalizeReasoningEffort(undefined)).toBe("medium");
  });
});
