import { describe, expect, test } from "bun:test";
import { validateApiKey } from "./validation";

describe("validateApiKey", () => {
  test("validates OpenAI keys", () => {
    expect(validateApiKey("openai", "sk-12345678901234567890")).toBe(true);
    expect(validateApiKey("openai", "bad" as unknown as string)).toBe(false);
  });

  test("validates Anthropic keys", () => {
    expect(validateApiKey("anthropic", "sk-ant-12345678901234567890")).toBe(
      true
    );
    expect(validateApiKey("anthropic", "sk-123" as unknown as string)).toBe(
      false
    );
  });

  test("accepts generic length for providers with variable formats", () => {
    expect(validateApiKey("google", "x".repeat(32))).toBe(true);
    expect(validateApiKey("groq", "x".repeat(32))).toBe(true);
    expect(validateApiKey("elevenlabs", "x".repeat(32))).toBe(true);
  });

  test("validates OpenRouter and Replicate prefixes", () => {
    expect(validateApiKey("openrouter", `sk-or-${"x".repeat(24)}`)).toBe(true);
    expect(validateApiKey("replicate", `r8_${"x".repeat(24)}`)).toBe(true);
  });

  test("returns false for unknown providers", () => {
    expect(validateApiKey("unknown", "x".repeat(40))).toBe(false);
    expect(validateApiKey("openai", "")).toBe(false);
  });
});
