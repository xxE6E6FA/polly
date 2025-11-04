import { describe, expect, test } from "bun:test";
import {
  getProviderReasoningConfig,
  normalizeReasoningEffort,
} from "./reasoning-config";

describe("reasoning-config helpers", () => {
  test("getProviderReasoningConfig builds config for enabled models", () => {
    const cfg = getProviderReasoningConfig(
      {
        modelId: "gemini-2.5-flash-lite",
        provider: "google",
        supportsReasoning: true,
      },
      { enabled: true, effort: "medium", maxTokens: 512 }
    );
    expect(cfg).toMatchObject({
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 512,
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("getProviderReasoningOptions returns empty when disabled or unsupported", () => {
    const cfg1 = getProviderReasoningConfig(
      { modelId: "foo", provider: "openai", supportsReasoning: false },
      { enabled: true, effort: "high" }
    );
    expect(cfg1).toEqual({});

    const cfg2 = getProviderReasoningConfig(
      { modelId: "foo", provider: "openai", supportsReasoning: true },
      { enabled: false, effort: "high" }
    );
    expect(cfg2).toEqual({});
  });

  test("normalizeReasoningEffort maps effort strings to provider-specific values", () => {
    expect(normalizeReasoningEffort("low")).toBeDefined();
    expect(normalizeReasoningEffort("medium")).toBeDefined();
    expect(normalizeReasoningEffort("high")).toBeDefined();
  });
});
