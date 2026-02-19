import { describe, expect, test } from "bun:test";
import {
  getProviderBaseOptions,
  getProviderReasoningConfig,
  getProviderReasoningOptions,
  getReasoningDisabledOptions,
  isGemini3Model,
  type ModelWithCapabilities,
} from "./reasoning-config";

describe("isGemini3Model", () => {
  test("returns true for Gemini 3 Pro models", () => {
    expect(isGemini3Model("gemini-3-pro-preview")).toBe(true);
    expect(isGemini3Model("gemini-3-pro")).toBe(true);
    expect(isGemini3Model("Gemini-3-Pro-Preview")).toBe(true);
  });

  test("returns true for Gemini 3 Flash models", () => {
    expect(isGemini3Model("gemini-3-flash-preview")).toBe(true);
    expect(isGemini3Model("gemini-3-flash")).toBe(true);
  });

  test("returns false for Gemini 2.x models", () => {
    expect(isGemini3Model("gemini-2.5-pro")).toBe(false);
    expect(isGemini3Model("gemini-2.5-flash")).toBe(false);
    expect(isGemini3Model("gemini-2.0-flash")).toBe(false);
  });

  test("returns false for other models", () => {
    expect(isGemini3Model("gpt-4o")).toBe(false);
    expect(isGemini3Model("claude-3-opus")).toBe(false);
  });
});

describe("getProviderReasoningOptions", () => {
  test("returns OpenAI reasoning config", () => {
    const result = getProviderReasoningOptions("openai");
    expect(result).toEqual({
      openai: { reasoning: true },
    });
  });

  test("returns Anthropic reasoning config with fixed default budget", () => {
    const result = getProviderReasoningOptions("anthropic");
    expect(result).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 16384,
        },
      },
    });
  });

  test("returns Gemini 2.5 config with fixed default budget", () => {
    const result = getProviderReasoningOptions("google", "gemini-2.5-pro");
    expect(result).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingBudget: 8192,
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("returns Gemini 3 config with thinkingLevel high", () => {
    const result = getProviderReasoningOptions(
      "google",
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

  test("returns Gemini 3 Flash config with thinkingLevel high", () => {
    const result = getProviderReasoningOptions(
      "google",
      "gemini-3-flash-preview"
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

  test("returns Groq config with default effort", () => {
    const result = getProviderReasoningOptions("groq");
    expect(result).toEqual({
      providerOptions: {
        groq: {
          reasoningFormat: "parsed",
          reasoningEffort: "default",
          parallelToolCalls: true,
        },
      },
    });
  });

  test("returns OpenRouter config with enabled: true", () => {
    const result = getProviderReasoningOptions("openrouter");
    expect(result).toEqual({
      providerOptions: {
        openrouter: {
          reasoning: { enabled: true },
        },
      },
    });
  });

  test("returns Moonshot config (OpenAI-compatible)", () => {
    const result = getProviderReasoningOptions("moonshot");
    expect(result).toEqual({
      openai: { reasoning: true },
    });
  });

  test("returns empty object for unknown provider", () => {
    const result = getProviderReasoningOptions("unknown-provider");
    expect(result).toEqual({});
  });
});

describe("getProviderBaseOptions", () => {
  test("returns Google base options with structuredOutputs disabled", () => {
    expect(getProviderBaseOptions("google")).toEqual({
      providerOptions: {
        google: { structuredOutputs: false },
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
      providerOptions: {
        openrouter: {
          reasoning: { enabled: false },
        },
      },
    });
  });

  test("returns Google base options for Google", () => {
    expect(getReasoningDisabledOptions("google")).toEqual({
      providerOptions: {
        google: { structuredOutputs: false },
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
    expect(getProviderReasoningConfig(model)).toEqual({});
  });

  test("returns Google base options for non-reasoning Google model", () => {
    const model: ModelWithCapabilities = {
      modelId: "gemini-1.5-flash",
      provider: "google",
      supportsReasoning: false,
    };
    expect(getProviderReasoningConfig(model)).toEqual({
      providerOptions: {
        google: { structuredOutputs: false },
      },
    });
  });

  test("returns empty config when reasoning disabled explicitly for OpenAI", () => {
    const model: ModelWithCapabilities = {
      modelId: "gpt-4o",
      provider: "openai",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: false })).toEqual({});
  });

  test("returns Google base when reasoning disabled for Google", () => {
    const model: ModelWithCapabilities = {
      modelId: "gemini-2.5-flash",
      provider: "google",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: false })).toEqual({
      providerOptions: {
        google: { structuredOutputs: false },
      },
    });
  });

  test("returns empty config when reasoning disabled for Anthropic", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-sonnet-4",
      provider: "anthropic",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: false })).toEqual({});
  });

  test("returns empty config when no reasoning config for Anthropic (optional)", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-opus-4",
      provider: "anthropic",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model)).toEqual({});
  });

  test("returns explicit disable for OpenRouter when reasoning disabled", () => {
    const model: ModelWithCapabilities = {
      modelId: "kimi-k2.5",
      provider: "openrouter",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: false })).toEqual({
      providerOptions: {
        openrouter: {
          reasoning: { enabled: false },
        },
      },
    });
  });

  test("returns explicit disable for OpenRouter when no config", () => {
    const model: ModelWithCapabilities = {
      modelId: "grok-4",
      provider: "openrouter",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model)).toEqual({
      providerOptions: {
        openrouter: {
          reasoning: { enabled: false },
        },
      },
    });
  });

  test("enables reasoning when model supports it and enabled: true", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-3.7-sonnet",
      provider: "anthropic",
      supportsReasoning: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: true })).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 16384,
        },
      },
    });
  });

  test("forces reasoning on for mandatory model (supportsTemperature: false)", () => {
    const model: ModelWithCapabilities = {
      modelId: "o3-mini",
      provider: "openai",
      supportsReasoning: true,
      supportsTemperature: false,
    };
    expect(getProviderReasoningConfig(model)).toEqual({
      openai: { reasoning: true },
    });
  });

  test("does not force reasoning on when supportsTemperature is true", () => {
    const model: ModelWithCapabilities = {
      modelId: "claude-sonnet-4",
      provider: "anthropic",
      supportsReasoning: true,
      supportsTemperature: true,
    };
    expect(getProviderReasoningConfig(model)).toEqual({});
  });

  test("forces reasoning for mandatory OpenRouter model", () => {
    const model: ModelWithCapabilities = {
      modelId: "openai/o3-mini",
      provider: "openrouter",
      supportsReasoning: true,
      supportsTemperature: false,
    };
    expect(getProviderReasoningConfig(model)).toEqual({
      providerOptions: {
        openrouter: {
          reasoning: { enabled: true },
        },
      },
    });
  });

  test("enables Google Gemini 2.5 reasoning with fixed budget", () => {
    const model: ModelWithCapabilities = {
      modelId: "gemini-2.5-pro",
      provider: "google",
      supportsReasoning: true,
      supportsTemperature: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: true })).toEqual({
      providerOptions: {
        google: {
          structuredOutputs: false,
          thinkingConfig: {
            thinkingBudget: 8192,
            includeThoughts: true,
          },
        },
      },
    });
  });

  test("enables Groq reasoning with default effort", () => {
    const model: ModelWithCapabilities = {
      modelId: "qwen-qwq",
      provider: "groq",
      supportsReasoning: true,
      supportsTemperature: true,
    };
    expect(getProviderReasoningConfig(model, { enabled: true })).toEqual({
      providerOptions: {
        groq: {
          reasoningFormat: "parsed",
          reasoningEffort: "default",
          parallelToolCalls: true,
        },
      },
    });
  });
});
