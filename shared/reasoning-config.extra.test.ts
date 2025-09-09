import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./reasoning-model-detection", () => ({
  getModelReasoningInfo: vi.fn(),
}));

import { getProviderReasoningConfig, getProviderReasoningOptions, normalizeReasoningEffort, ANTHROPIC_BUDGET_MAP, GOOGLE_THINKING_BUDGET_MAP } from "./reasoning-config";
import { getModelReasoningInfo } from "./reasoning-model-detection";

describe("reasoning-config (extra)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty when model does not support reasoning", () => {
    (getModelReasoningInfo as any).mockReturnValue({
      supportsReasoning: false,
      reasoningType: "none",
      needsSpecialHandling: false,
    });

    const cfg = getProviderReasoningConfig({ provider: "openai", modelId: "gpt", supportsReasoning: false }, { enabled: true });
    expect(cfg).toEqual({});
  });

  it("enables provider-specific options when special handling needed (no explicit config)", () => {
    (getModelReasoningInfo as any).mockReturnValue({
      supportsReasoning: true,
      reasoningType: "mandatory",
      needsSpecialHandling: true,
    });

    // OpenAI => simple flag
    let cfg = getProviderReasoningConfig({ provider: "openai", modelId: "o1-preview" });
    expect(cfg).toEqual({ openai: { reasoning: true } });

    // Google => thinking budget uses default for medium
    cfg = getProviderReasoningConfig({ provider: "google", modelId: "gemini-2.5-pro" });
    expect(cfg).toMatchObject({ providerOptions: { google: { thinkingConfig: { thinkingBudget: GOOGLE_THINKING_BUDGET_MAP["medium"] } } } });

    // Anthropic => budgetTokens uses default for medium
    cfg = getProviderReasoningConfig({ provider: "anthropic", modelId: "claude-opus-4" });
    expect(cfg).toEqual({ anthropic: { thinking: { type: "enabled", budgetTokens: ANTHROPIC_BUDGET_MAP["medium"] } } });
  });

  it("maps Groq options with effort and max tokens", () => {
    const cfg: any = getProviderReasoningOptions("groq", { effort: "high", maxTokens: 1234 });
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

  it("builds OpenRouter extraBody with effort or default enabled", () => {
    // With explicit effort
    const cfg: any = getProviderReasoningOptions("openrouter", { effort: "low" });
    expect(cfg.extraBody.reasoning).toMatchObject({ effort: "low", exclude: false });
    expect(cfg.extraBody.reasoning.enabled).toBeUndefined();

    // With no explicit config: exclude is set and enabled defaults to true
    const defCfg: any = getProviderReasoningOptions("openrouter");
    expect(defCfg.extraBody.reasoning).toMatchObject({ exclude: false, enabled: true });
  });

  it("normalizes invalid effort values to medium", () => {
    expect(normalizeReasoningEffort("weird" as any)).toBe("medium");
    expect(normalizeReasoningEffort(undefined)).toBe("medium");
  });
});

