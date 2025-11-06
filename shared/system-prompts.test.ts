import { describe, expect, test } from "bun:test";
import { mergeSystemPrompts } from "./system-prompts";

describe("mergeSystemPrompts", () => {
  test("returns baseline instructions when no persona prompt provided", () => {
    const baseline = "You are a helpful assistant.";
    const result = mergeSystemPrompts(baseline);
    expect(result).toBe(baseline);
  });

  test("returns baseline instructions when persona prompt is empty", () => {
    const baseline = "You are a helpful assistant.";
    const result = mergeSystemPrompts(baseline, "");
    expect(result).toBe(baseline);
  });

  test("merges baseline and persona prompts correctly", () => {
    const baseline = "You are an AI assistant.";
    const persona = "You are specialized in coding.";
    const result = mergeSystemPrompts(baseline, persona);

    expect(result).toContain(baseline);
    expect(result).toContain(
      "You are Polly, an AI assistant. Be helpful, direct, and genuinely useful."
    );
    expect(result).toContain(persona);
    expect(result).toMatch(
      /^You are an AI assistant\.\n\nYou are Polly.*coding\.$/s
    );
  });

  test("handles multiline persona prompts", () => {
    const baseline = "Baseline instructions.";
    const persona = "Line 1\nLine 2\nLine 3";
    const result = mergeSystemPrompts(baseline, persona);

    expect(result).toContain(baseline);
    expect(result).toContain(persona);
  });

  test("preserves formatting and whitespace", () => {
    const baseline = "First instruction.";
    const persona = "  Persona with spaces  ";
    const result = mergeSystemPrompts(baseline, persona);

    expect(result).toBe(
      `${baseline}\n\nYou are Polly, an AI assistant. Be helpful, direct, and genuinely useful.\n\n${persona}`
    );
  });
});
