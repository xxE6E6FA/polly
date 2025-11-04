import { describe, expect, test } from "bun:test";
import {
  getReasoningType,
  needsSpecialReasoningHandling,
  supportsReasoning,
} from "./reasoning-model-detection";

describe("reasoning-model-detection", () => {
  test("detects optional reasoning for gemini flash-lite", () => {
    expect(supportsReasoning("google", "gemini-2.5-flash-lite")).toBe(true);
    expect(getReasoningType("google", "gemini-2.5-flash-lite")).toBe(
      "optional"
    );
  });

  test("detects mandatory reasoning for gemini 2.5 pro with special handling", () => {
    expect(supportsReasoning("google", "gemini-2.5-pro")).toBe(true);
    expect(getReasoningType("google", "gemini-2.5-pro")).toBe("mandatory");
    expect(needsSpecialReasoningHandling("google", "gemini-2.5-pro")).toBe(
      true
    );
  });

  test("detects OpenAI o1 as mandatory with special handling", () => {
    expect(supportsReasoning("openai", "o1-mini")).toBe(true);
    expect(getReasoningType("openai", "o1-mini")).toBe("mandatory");
    expect(needsSpecialReasoningHandling("openai", "o1-mini")).toBe(true);
  });

  test("inherits patterns for OpenRouter", () => {
    expect(supportsReasoning("openrouter", "deepseek-r1")).toBe(true); // mandatory pattern
    expect(getReasoningType("openrouter", "llama-3.1-8b")).toBe("optional"); // optional pattern
  });
});
