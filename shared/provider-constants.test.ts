import { describe, expect, test } from "bun:test";
import { PROVIDER_CONFIG, PROVIDER_NAMES } from "./provider-constants";

describe("provider-constants", () => {
  test("has consistent provider keys and titles", () => {
    const keys = Object.keys(PROVIDER_NAMES);
    // Ensure config has same keys
    expect(Object.keys(PROVIDER_CONFIG)).toEqual(keys);
    // Spot-check titles
    expect(PROVIDER_CONFIG.openai.title).toBe("OpenAI");
    expect(PROVIDER_CONFIG.google.title).toBe("Google AI");
    expect(PROVIDER_CONFIG.openrouter.title).toBe("OpenRouter");
  });
});
