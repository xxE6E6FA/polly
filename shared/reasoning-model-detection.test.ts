import { describe, expect, test } from "bun:test";
import {
  getModelReasoningInfo,
  getReasoningType,
  hasMandatoryReasoning,
  hasOptionalReasoning,
  isGemini3Model,
  needsSpecialReasoningHandling,
  supportsReasoning,
} from "./reasoning-model-detection";

describe("hasMandatoryReasoning", () => {
  test("detects OpenAI o-series models", () => {
    expect(hasMandatoryReasoning("openai", "o1-preview")).toBe(true);
    expect(hasMandatoryReasoning("openai", "o1-mini")).toBe(true);
    expect(hasMandatoryReasoning("openai", "o3-mini")).toBe(true);
  });

  test("detects Google Gemini 3 Pro", () => {
    expect(hasMandatoryReasoning("google", "gemini-3-pro-preview")).toBe(true);
    expect(hasMandatoryReasoning("google", "gemini-3-pro")).toBe(true);
  });

  test("detects Google Gemini 2.5 Pro", () => {
    expect(hasMandatoryReasoning("google", "gemini-2.5-pro")).toBe(true);
    expect(hasMandatoryReasoning("google", "gemini-2.5-pro-exp")).toBe(true);
  });

  test("detects DeepSeek R1", () => {
    expect(hasMandatoryReasoning("openrouter", "deepseek-r1")).toBe(true);
    expect(hasMandatoryReasoning("openrouter", "deepseek-r1-distill")).toBe(
      true
    );
  });

  test("detects Moonshot Kimi K2 Thinking", () => {
    expect(hasMandatoryReasoning("moonshot", "kimi-k2-thinking")).toBe(true);
    expect(hasMandatoryReasoning("moonshot", "kimi-k2-thinking-0730")).toBe(
      true
    );
  });

  test("returns false for non-reasoning models", () => {
    expect(hasMandatoryReasoning("openai", "gpt-4o")).toBe(false);
    expect(hasMandatoryReasoning("anthropic", "claude-3-5-sonnet")).toBe(false);
    expect(hasMandatoryReasoning("google", "gemini-1.5-flash")).toBe(false);
  });

  test("OpenRouter inherits mandatory patterns", () => {
    expect(hasMandatoryReasoning("openrouter", "o1-preview")).toBe(true);
    expect(hasMandatoryReasoning("openrouter", "gemini-2.5-pro")).toBe(true);
  });

  test("returns false for non-thinking Moonshot models", () => {
    expect(hasMandatoryReasoning("moonshot", "kimi-k2")).toBe(false);
    expect(hasMandatoryReasoning("moonshot", "moonlight-16k-v2")).toBe(false);
  });
});

describe("hasOptionalReasoning", () => {
  test("detects Google Gemini 3 Flash", () => {
    expect(hasOptionalReasoning("google", "gemini-3-flash-preview")).toBe(true);
    expect(hasOptionalReasoning("google", "gemini-3-flash")).toBe(true);
  });

  test("detects Google Gemini 2.x Flash models", () => {
    expect(hasOptionalReasoning("google", "gemini-2.5-flash")).toBe(true);
    expect(hasOptionalReasoning("google", "gemini-2.0-flash-exp")).toBe(true);
    expect(hasOptionalReasoning("google", "gemini-1.5-pro")).toBe(true);
  });

  test("detects Anthropic Claude models with extended thinking", () => {
    expect(hasOptionalReasoning("anthropic", "claude-opus-4")).toBe(true);
    expect(hasOptionalReasoning("anthropic", "claude-sonnet-4")).toBe(true);
    expect(hasOptionalReasoning("anthropic", "claude-3-7-sonnet")).toBe(true);
  });

  test("detects QwQ models", () => {
    expect(hasOptionalReasoning("openrouter", "qwq-32b-preview")).toBe(true);
  });

  test("returns false for non-reasoning models", () => {
    expect(hasOptionalReasoning("openai", "gpt-3.5-turbo")).toBe(false);
    expect(hasOptionalReasoning("anthropic", "claude-3-haiku")).toBe(false);
  });

  test("OpenRouter inherits optional patterns", () => {
    expect(hasOptionalReasoning("openrouter", "gemini-2.5-flash")).toBe(true);
    expect(hasOptionalReasoning("openrouter", "claude-opus-4")).toBe(true);
  });
});

describe("supportsReasoning", () => {
  test("returns true for mandatory reasoning models", () => {
    expect(supportsReasoning("openai", "o1-preview")).toBe(true);
    expect(supportsReasoning("google", "gemini-2.5-pro")).toBe(true);
  });

  test("returns true for optional reasoning models", () => {
    expect(supportsReasoning("google", "gemini-2.5-flash")).toBe(true);
    expect(supportsReasoning("anthropic", "claude-opus-4")).toBe(true);
  });

  test("returns false for non-reasoning models", () => {
    expect(supportsReasoning("openai", "gpt-4o")).toBe(false);
    expect(supportsReasoning("anthropic", "claude-3-haiku")).toBe(false);
  });

  test("returns true for Moonshot thinking models", () => {
    expect(supportsReasoning("moonshot", "kimi-k2-thinking")).toBe(true);
  });

  test("returns false for non-thinking Moonshot models", () => {
    expect(supportsReasoning("moonshot", "kimi-k2")).toBe(false);
  });
});

describe("isGemini3Model", () => {
  test("returns true for Gemini 3 Pro models", () => {
    expect(isGemini3Model("gemini-3-pro-preview")).toBe(true);
    expect(isGemini3Model("gemini-3-pro")).toBe(true);
    expect(isGemini3Model("Gemini-3-Pro-Preview")).toBe(true); // case insensitive
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

describe("getReasoningType", () => {
  test("returns mandatory for Gemini 3 Pro", () => {
    expect(getReasoningType("google", "gemini-3-pro-preview")).toBe(
      "mandatory"
    );
    expect(getReasoningType("google", "gemini-3-pro")).toBe("mandatory");
  });

  test("returns optional for Gemini 3 Flash", () => {
    expect(getReasoningType("google", "gemini-3-flash-preview")).toBe(
      "optional"
    );
  });

  test("returns mandatory for o-series and Gemini 2.5 Pro models", () => {
    expect(getReasoningType("openai", "o1-preview")).toBe("mandatory");
    expect(getReasoningType("google", "gemini-2.5-pro")).toBe("mandatory");
  });

  test("returns optional for flash models", () => {
    expect(getReasoningType("google", "gemini-2.5-flash")).toBe("optional");
    expect(getReasoningType("anthropic", "claude-opus-4")).toBe("optional");
  });

  test("returns none for non-reasoning models", () => {
    expect(getReasoningType("openai", "gpt-4o")).toBe("none");
    expect(getReasoningType("anthropic", "claude-3-haiku")).toBe("none");
  });

  test("returns mandatory for Moonshot thinking models", () => {
    expect(getReasoningType("moonshot", "kimi-k2-thinking")).toBe("mandatory");
  });

  test("returns none for non-thinking Moonshot models", () => {
    expect(getReasoningType("moonshot", "kimi-k2")).toBe("none");
  });
});

describe("needsSpecialReasoningHandling", () => {
  test("returns true for Google Gemini 3 Pro", () => {
    expect(
      needsSpecialReasoningHandling("google", "gemini-3-pro-preview")
    ).toBe(true);
    expect(needsSpecialReasoningHandling("google", "gemini-3-pro")).toBe(true);
  });

  test("returns true for Google Gemini 2.5 Pro", () => {
    expect(needsSpecialReasoningHandling("google", "gemini-2.5-pro")).toBe(
      true
    );
  });

  test("returns true for OpenAI o-series", () => {
    expect(needsSpecialReasoningHandling("openai", "o1-preview")).toBe(true);
    expect(needsSpecialReasoningHandling("openai", "o3-mini")).toBe(true);
  });

  test("returns true for Anthropic optional reasoning models", () => {
    expect(needsSpecialReasoningHandling("anthropic", "claude-opus-4")).toBe(
      true
    );
    expect(
      needsSpecialReasoningHandling("anthropic", "claude-3-7-sonnet")
    ).toBe(true);
  });

  test("returns false for standard models", () => {
    expect(needsSpecialReasoningHandling("openai", "gpt-4o")).toBe(false);
    expect(needsSpecialReasoningHandling("google", "gemini-1.5-flash")).toBe(
      false
    );
  });
});

describe("getModelReasoningInfo", () => {
  test("returns complete info for mandatory reasoning model", () => {
    const info = getModelReasoningInfo("openai", "o1-preview");

    expect(info.supportsReasoning).toBe(true);
    expect(info.reasoningType).toBe("mandatory");
    expect(info.needsSpecialHandling).toBe(true);
    expect(info.providerConfig).toBeDefined();
  });

  test("returns complete info for optional reasoning model", () => {
    const info = getModelReasoningInfo("google", "gemini-2.5-flash");

    expect(info.supportsReasoning).toBe(true);
    expect(info.reasoningType).toBe("optional");
    expect(info.needsSpecialHandling).toBe(false);
    expect(info.providerConfig).toBeDefined();
  });

  test("returns complete info for non-reasoning model", () => {
    const info = getModelReasoningInfo("openai", "gpt-4o");

    expect(info.supportsReasoning).toBe(false);
    expect(info.reasoningType).toBe("none");
    expect(info.needsSpecialHandling).toBe(false);
  });

  test("handles case insensitivity", () => {
    const info1 = getModelReasoningInfo("openai", "O1-PREVIEW");
    const info2 = getModelReasoningInfo("openai", "o1-preview");

    expect(info1.supportsReasoning).toBe(info2.supportsReasoning);
    expect(info1.reasoningType).toBe(info2.reasoningType);
  });

  test("OpenRouter gets full inherited patterns", () => {
    const info = getModelReasoningInfo("openrouter", "o1-preview");

    expect(info.supportsReasoning).toBe(true);
    expect(info.reasoningType).toBe("mandatory");
    expect(info.providerConfig).toBeDefined();
    expect(info.providerConfig?.mandatoryPatterns).toBeDefined();
    expect(info.providerConfig?.optionalPatterns).toBeDefined();
  });

  test("returns complete info for Moonshot thinking model", () => {
    const info = getModelReasoningInfo("moonshot", "kimi-k2-thinking");

    expect(info.supportsReasoning).toBe(true);
    expect(info.reasoningType).toBe("mandatory");
    expect(info.needsSpecialHandling).toBe(false);
    expect(info.providerConfig).toBeDefined();
  });

  test("returns complete info for non-thinking Moonshot model", () => {
    const info = getModelReasoningInfo("moonshot", "kimi-k2");

    expect(info.supportsReasoning).toBe(false);
    expect(info.reasoningType).toBe("none");
    expect(info.needsSpecialHandling).toBe(false);
  });
});
