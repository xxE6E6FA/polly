import { describe, expect, test } from "bun:test";
import {
  PROVIDER_CONFIG,
  PROVIDER_NAMES,
  type ProviderType,
} from "./provider-constants";

describe("PROVIDER_NAMES", () => {
  test("contains all expected providers", () => {
    expect(PROVIDER_NAMES.openai).toBe("OpenAI");
    expect(PROVIDER_NAMES.anthropic).toBe("Anthropic");
    expect(PROVIDER_NAMES.google).toBe("Google");
    expect(PROVIDER_NAMES.groq).toBe("Groq");
    expect(PROVIDER_NAMES.openrouter).toBe("OpenRouter");
    expect(PROVIDER_NAMES.elevenlabs).toBe("ElevenLabs");
  });
});

describe("ProviderType", () => {
  test("includes all provider keys", () => {
    const expectedKeys: ProviderType[] = [
      "openai",
      "anthropic",
      "google",
      "groq",
      "openrouter",
      "elevenlabs",
    ];

    expectedKeys.forEach(key => {
      expect(key in PROVIDER_NAMES).toBe(true);
    });
  });
});

describe("PROVIDER_CONFIG", () => {
  test("contains config for all providers", () => {
    expect(PROVIDER_CONFIG.openai.title).toBe("OpenAI");
    expect(PROVIDER_CONFIG.anthropic.title).toBe("Anthropic");
    expect(PROVIDER_CONFIG.google.title).toBe("Google AI");
    expect(PROVIDER_CONFIG.groq.title).toBe("Groq");
    expect(PROVIDER_CONFIG.openrouter.title).toBe("OpenRouter");
    expect(PROVIDER_CONFIG.elevenlabs.title).toBe("ElevenLabs");
  });
});
