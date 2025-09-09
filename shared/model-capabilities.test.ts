import { describe, expect, it } from "vitest";
import {
  filterSamplingParameters,
  getSupportedSamplingParameters,
} from "./model-capabilities";

describe("model-capabilities sampling helpers", () => {
  it("getSupportedSamplingParameters returns expected flags per provider", () => {
    expect(getSupportedSamplingParameters("openai")).toMatchObject({
      temperature: true,
      topP: true,
      topK: true,
      frequencyPenalty: true,
      presencePenalty: true,
      repetitionPenalty: false,
    });
    expect(getSupportedSamplingParameters("anthropic")).toMatchObject({
      frequencyPenalty: false,
      presencePenalty: false,
      repetitionPenalty: false,
    });
    expect(getSupportedSamplingParameters("google")).toMatchObject({
      topK: true,
      frequencyPenalty: false,
    });
    expect(getSupportedSamplingParameters("groq")).toMatchObject({
      repetitionPenalty: true,
    });
    expect(getSupportedSamplingParameters("unknown")).toMatchObject({
      topK: false,
      frequencyPenalty: false,
      presencePenalty: false,
    });
  });

  it("filterSamplingParameters removes unsupported keys", () => {
    const params = {
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
      repetitionPenalty: 1.1,
    };
    const openai = filterSamplingParameters("openai", params);
    expect(openai).toMatchObject({
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
    });
    expect(openai).not.toHaveProperty("repetitionPenalty");

    const anthropic = filterSamplingParameters("anthropic", params);
    expect(anthropic).toMatchObject({ temperature: 0.5, topP: 0.9, topK: 40 });
    expect(anthropic).not.toHaveProperty("frequencyPenalty");
    expect(anthropic).not.toHaveProperty("presencePenalty");
    expect(anthropic).not.toHaveProperty("repetitionPenalty");

    const unknown = filterSamplingParameters("unknown", params);
    expect(unknown).toMatchObject({ temperature: 0.5, topP: 0.9 });
    expect(unknown).not.toHaveProperty("topK");
  });
});

