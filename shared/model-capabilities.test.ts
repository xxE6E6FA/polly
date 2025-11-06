import { describe, expect, test } from "bun:test";
import {
  filterSamplingParameters,
  getSupportedSamplingParameters,
} from "./model-capabilities";

describe("getSupportedSamplingParameters", () => {
  test("returns correct capabilities for OpenAI", () => {
    const caps = getSupportedSamplingParameters("openai");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(true);
    expect(caps.frequencyPenalty).toBe(true);
    expect(caps.presencePenalty).toBe(true);
    expect(caps.repetitionPenalty).toBe(false);
  });

  test("returns correct capabilities for Anthropic", () => {
    const caps = getSupportedSamplingParameters("anthropic");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(true);
    expect(caps.frequencyPenalty).toBe(false);
    expect(caps.presencePenalty).toBe(false);
    expect(caps.repetitionPenalty).toBe(false);
  });

  test("returns correct capabilities for Google", () => {
    const caps = getSupportedSamplingParameters("google");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(true);
    expect(caps.frequencyPenalty).toBe(false);
    expect(caps.presencePenalty).toBe(false);
    expect(caps.repetitionPenalty).toBe(false);
  });

  test("returns correct capabilities for Groq", () => {
    const caps = getSupportedSamplingParameters("groq");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(true);
    expect(caps.frequencyPenalty).toBe(true);
    expect(caps.presencePenalty).toBe(true);
    expect(caps.repetitionPenalty).toBe(true);
  });

  test("returns correct capabilities for OpenRouter", () => {
    const caps = getSupportedSamplingParameters("openrouter");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(true);
    expect(caps.frequencyPenalty).toBe(true);
    expect(caps.presencePenalty).toBe(true);
    expect(caps.repetitionPenalty).toBe(true);
  });

  test("returns conservative defaults for unknown provider", () => {
    const caps = getSupportedSamplingParameters("unknown-provider");
    expect(caps.temperature).toBe(true);
    expect(caps.topP).toBe(true);
    expect(caps.topK).toBe(false);
    expect(caps.frequencyPenalty).toBe(false);
    expect(caps.presencePenalty).toBe(false);
    expect(caps.repetitionPenalty).toBe(false);
  });
});

describe("filterSamplingParameters", () => {
  test("filters out unsupported parameters for Anthropic", () => {
    const params = {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      repetitionPenalty: 1.2,
    };

    const filtered = filterSamplingParameters("anthropic", params);

    expect(filtered.temperature).toBe(0.7);
    expect(filtered.topP).toBe(0.9);
    expect(filtered.topK).toBe(40);
    expect(filtered.frequencyPenalty).toBeUndefined();
    expect(filtered.presencePenalty).toBeUndefined();
    expect(filtered.repetitionPenalty).toBeUndefined();
  });

  test("keeps all supported parameters for OpenRouter", () => {
    const params = {
      temperature: 0.8,
      topP: 0.95,
      topK: 50,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
      repetitionPenalty: 1.1,
    };

    const filtered = filterSamplingParameters("openrouter", params);

    expect(filtered).toEqual(params);
  });

  test("handles partial parameter objects", () => {
    const params = {
      temperature: 0.5,
      topK: 20,
    };

    const filtered = filterSamplingParameters("openai", params);

    expect(filtered.temperature).toBe(0.5);
    expect(filtered.topK).toBe(20);
    expect(filtered.topP).toBeUndefined();
    expect(filtered.frequencyPenalty).toBeUndefined();
  });

  test("returns empty object when no supported params provided", () => {
    const params = {
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    };

    const filtered = filterSamplingParameters("anthropic", params);

    expect(filtered).toEqual({});
  });

  test("preserves zero values for supported parameters", () => {
    const params = {
      temperature: 0,
      topP: 0,
      frequencyPenalty: 0,
    };

    const filtered = filterSamplingParameters("openai", params);

    expect(filtered.temperature).toBe(0);
    expect(filtered.topP).toBe(0);
    expect(filtered.frequencyPenalty).toBe(0);
  });

  test("filters repetitionPenalty for OpenAI", () => {
    const params = {
      temperature: 0.7,
      repetitionPenalty: 1.1,
    };

    const filtered = filterSamplingParameters("openai", params);

    expect(filtered.temperature).toBe(0.7);
    expect(filtered.repetitionPenalty).toBeUndefined();
  });
});
