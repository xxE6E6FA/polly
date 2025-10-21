import { describe, expect, it } from "vitest";
import {
  getReasoningType,
  needsSpecialReasoningHandling,
  supportsReasoning,
} from "./reasoning-model-detection";

describe("reasoning-model-detection", () => {
  it("detects optional reasoning for gemini flash-lite", () => {
    expect(supportsReasoning("google", "gemini-2.5-flash-lite")).toBe(true);
    expect(getReasoningType("google", "gemini-2.5-flash-lite")).toBe(
      "optional"
    );
  });

  it("detects mandatory reasoning for gemini 2.5 pro with special handling", () => {
    expect(supportsReasoning("google", "gemini-2.5-pro")).toBe(true);
    expect(getReasoningType("google", "gemini-2.5-pro")).toBe("mandatory");
    expect(needsSpecialReasoningHandling("google", "gemini-2.5-pro")).toBe(
      true
    );
  });

  it("detects OpenAI o1 as mandatory with special handling", () => {
    expect(supportsReasoning("openai", "o1-mini")).toBe(true);
    expect(getReasoningType("openai", "o1-mini")).toBe("mandatory");
    expect(needsSpecialReasoningHandling("openai", "o1-mini")).toBe(true);
  });

  it("inherits patterns for OpenRouter", () => {
    expect(supportsReasoning("openrouter", "deepseek-r1")).toBe(true); // mandatory pattern
    expect(getReasoningType("openrouter", "llama-3.1-8b")).toBe("optional"); // optional pattern
  });
});
