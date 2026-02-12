import { describe, expect, test } from "bun:test";
import {
  ANTHROPIC_BUDGET_MAP,
  GOOGLE_THINKING_BUDGET_MAP,
  getProviderBaseOptions,
  getProviderReasoningConfig,
  getProviderReasoningOptions,
  getReasoningDisabledOptions,
  type ModelWithCapabilities,
  normalizeReasoningEffort,
  type ReasoningConfig,
} from "./reasoning-config";

describe("normalizeReasoningEffort", () => {
  test("returns medium for undefined input", () => {
    expect(normalizeReasoningEffort()).toBe("medium");
  });

  test("handles lowercase effort levels", () => {
    expect(normalizeReasoningEffort("low")).toBe("low");
    expect(normalizeReasoningEffort("medium")).toBe("medium");
    expect(normalizeReasoningEffort("high")).toBe("high");
  });

  test("normalizes uppercase to lowercase", () => {
    expect(normalizeReasoningEffort("LOW")).toBe("low");
    expect(normalizeReasoningEffort("HIGH")).toBe("high");
  });

  test("returns medium for invalid values", () => {
    expect(normalizeReasoningEffort("invalid")).toBe("medium");
    expect(normalizeReasoningEffort("extreme")).toBe("medium");
  });
});

describe("getProviderReasoningOptions", () => {
  test("returns OpenAI reasoning config", () => {
    const result = getProviderReasoningOptions("openai", {
      effort: "high",
    });

    expect(result).toEqual({
      openai: {
        reasoning: true,
      },
    });
  });

  test("returns Google reasoning config with default effort", () => {
    const result = getProviderReasoningOptions("google");

    expect(result).toEqual({
      providerOptions: {
        google: {
          // structuredOutputs is explicitly disabled to prevent JSON output
          structuredOutputs: false,
          thinkingConfig: {
            thinkingBudget: GOOGLE_THINKING_BUDGET_MAP.medium,
            // includeThoughts is enabled - @ai-sdk/google v2.0.51+ properly supports it
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Google reasoning config with custom effort", () => {
    const result = getProviderReasoningOptions("google", { effort: "high" });

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingBudget: GOOGLE_THINKING_BUDGET_MAP.high,
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Google reasoning config with custom maxTokens", () => {
    const result = getProviderReasoningOptions("google", { maxTokens: 2048 });

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Gemini 3 Pro config with thinkingLevel high by default", () => {
    const result = getProviderReasoningOptions(
      "google",
      { effort: "high" },
      "gemini-3-pro-preview"
    );

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingLevel: "high",
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Gemini 3 Pro config with thinkingLevel low", () => {
    const result = getProviderReasoningOptions(
      "google",
      { effort: "low" },
      "gemini-3-pro-preview"
    );

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingLevel: "low",
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Gemini 3 Pro config with low for medium effort (Pro doesn't support medium)", () => {
    const result = getProviderReasoningOptions(
      "google",
      { effort: "medium" },
      "gemini-3-pro-preview"
    );

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            // Pro falls back to low for medium effort
            thinkingLevel: "low",
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Gemini 3 Flash config with thinkingLevel medium", () => {
    const result = getProviderReasoningOptions(
      "google",
      { effort: "medium" },
      "gemini-3-flash-preview"
    );

    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            // Flash supports medium
            thinkingLevel: "medium",
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Anthropic reasoning config with default effort", () => {
    const result = getProviderReasoningOptions("anthropic");

    expect(result).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: ANTHROPIC_BUDGET_MAP.medium,
        },
      },
    });
  });

  test("returns Anthropic reasoning config with custom effort", () => {
    const result = getProviderReasoningOptions("anthropic", { effort: "low" });

    expect(result).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: ANTHROPIC_BUDGET_MAP.low,
        },
      },
    });
  });

  test("returns Groq reasoning config", () => {
    const result = getProviderReasoningOptions("groq", { effort: "high" });

    expect(result).toEqual({
      providerOptions: {
        groq: {
          reasoningFormat: "parsed",
          reasoningEffort: "high",
          parallelToolCalls: true,
        },
      },
    });
  });

  test("returns Groq reasoning config with maxTokens", () => {
    const result = getProviderReasoningOptions("groq", {
      effort: "medium",
      maxTokens: 4000,
    });

    expect(result).toEqual({
      providerOptions: {
        groq: {
          reasoningFormat: "parsed",
          reasoningEffort: "default",
          maxOutputTokens: 4000,
          parallelToolCalls: true,
        },
      },
    });
  });

  test("maps Groq effort levels correctly", () => {
    const low = getProviderReasoningOptions("groq", { effort: "low" });
    expect(
      "providerOptions" in low &&
        low.providerOptions &&
        "groq" in low.providerOptions &&
        low.providerOptions.groq.reasoningEffort
    ).toBe("low");

    const medium = getProviderReasoningOptions("groq", { effort: "medium" });
    expect(
      "providerOptions" in medium &&
        medium.providerOptions &&
        "groq" in medium.providerOptions &&
        medium.providerOptions.groq.reasoningEffort
    ).toBe("default");

    const high = getProviderReasoningOptions("groq", { effort: "high" });
    expect(
      "providerOptions" in high &&
        high.providerOptions &&
        "groq" in high.providerOptions &&
        high.providerOptions.groq.reasoningEffort
    ).toBe("high");
  });

  test("returns OpenRouter reasoning config with effort", () => {
    const result = getProviderReasoningOptions("openrouter", {
      effort: "high",
    });

    expect(result).toEqual({
      extraBody: {
        reasoning: {
          effort: "high",
          exclude: false,
        },
      },
    });
  });

  test("returns OpenRouter reasoning config with maxTokens", () => {
    const result = getProviderReasoningOptions("openrouter", {
      maxTokens: 8000,
    });

    expect(result).toEqual({
      extraBody: {
        reasoning: {
          max_tokens: 8000,
          exclude: false,
        },
      },
    });
  });

  test("returns OpenRouter reasoning config with enabled flag when no explicit config", () => {
    const result = getProviderReasoningOptions("openrouter");

    expect(result).toEqual({
      extraBody: {
        reasoning: {
          enabled: true,
          exclude: false,
        },
      },
    });
  });

  test("returns Moonshot reasoning config", () => {
    const result = getProviderReasoningOptions("moonshot");

    expect(result).toEqual({
      openai: {
        reasoning: true,
      },
    });
  });

  test("returns Moonshot reasoning config regardless of effort level", () => {
    const result = getProviderReasoningOptions("moonshot", { effort: "high" });

    // Moonshot always returns the same config since reasoning is mandatory
    expect(result).toEqual({
      openai: {
        reasoning: true,
      },
    });
  });

  test("returns empty object for unknown provider", () => {
    const result = getProviderReasoningOptions("unknown-provider");
    expect(result).toEqual({});
  });
});

describe("getProviderBaseOptions", () => {
  test("returns Google base options with structuredOutputs disabled", () => {
    const result = getProviderBaseOptions("google");
    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
        },
      },
    });
  });

  test("returns empty object for OpenAI", () => {
    expect(getProviderBaseOptions("openai")).toEqual({});
  });

  test("returns empty object for Anthropic", () => {
    expect(getProviderBaseOptions("anthropic")).toEqual({});
  });

  test("returns empty object for unknown provider", () => {
    expect(getProviderBaseOptions("unknown")).toEqual({});
  });
});

describe("getReasoningDisabledOptions", () => {
  test("returns explicit disable for OpenRouter", () => {
    expect(getReasoningDisabledOptions("openrouter")).toEqual({
      extraBody: {
        reasoning: {
          enabled: false,
        },
      },
    });
  });

  test("returns Google base options for Google", () => {
    expect(getReasoningDisabledOptions("google")).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
        },
      },
    });
  });

  test("returns empty object for Anthropic", () => {
    expect(getReasoningDisabledOptions("anthropic")).toEqual({});
  });

  test("returns empty object for OpenAI", () => {
    expect(getReasoningDisabledOptions("openai")).toEqual({});
  });
});

describe("getProviderReasoningConfig", () => {
  test("returns empty config for non-reasoning OpenAI model", () => {
    const model: ModelWithCapabilities = {
      modelId: "gpt-3.5-turbo",
      provider: "openai",
      supportsReasoning: false,
    };

    const result = getProviderReasoningConfig(model);
    expect(result).toEqual({});
  });

  test("returns Google base options for non-reasoning Google model", () => {
    const model: ModelWithCapabilities = {
      modelId: "gemini-1.5-flash",
      provider: "google",
      supportsReasoning: false,
    };

    const result = getProviderReasoningConfig(model);
    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
        },
      },
    });
  });

  test("returns empty config when reasoning disabled explicitly for OpenAI", () => {
    const model: ModelWithCapabilities = {
      modelId: "gpt-4o",
      provider: "openai",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model, { enabled: false });
    expect(result).toEqual({});
  });

  test("returns Google base options when reasoning disabled explicitly for Google", () => {
    // Use a model with optional reasoning (not mandatory like gemini-2.5-pro)
    const model: ModelWithCapabilities = {
      modelId: "gemini-2.5-flash",
      provider: "google",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model, { enabled: false });
    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
        },
      },
    });
  });

  test("returns empty config when reasoning disabled for Anthropic model", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-sonnet-4",
      provider: "anthropic",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model, { enabled: false });
    expect(result).toEqual({});
  });

  test("returns empty config when no reasoning config for Anthropic model", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-opus-4",
      provider: "anthropic",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model);
    expect(result).toEqual({});
  });

  test("returns explicit disable for OpenRouter when reasoning disabled", () => {
    const model: ModelWithCapabilities = {
      modelId: "kimi-k2.5",
      provider: "openrouter",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model, { enabled: false });
    expect(result).toEqual({
      extraBody: {
        reasoning: {
          enabled: false,
        },
      },
    });
  });

  test("returns explicit disable for OpenRouter when no reasoning config", () => {
    const model: ModelWithCapabilities = {
      modelId: "grok-4",
      provider: "openrouter",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model);
    expect(result).toEqual({
      extraBody: {
        reasoning: {
          enabled: false,
        },
      },
    });
  });

  test("enables reasoning when model supports it and config provided", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-3.7-sonnet",
      provider: "anthropic",
      supportsReasoning: true,
    };

    const result = getProviderReasoningConfig(model, {
      enabled: true,
      effort: "high",
    });

    expect(result).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: ANTHROPIC_BUDGET_MAP.high,
        },
      },
    });
  });
});
