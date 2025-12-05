import { describe, expect, test } from "bun:test";
import {
  BASELINE_SYSTEM_INSTRUCTIONS,
  getBaselineInstructions,
  mergeSystemPrompts,
} from "./system-prompts";

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

describe("getBaselineInstructions", () => {
  test("replaces model name placeholder", () => {
    const result = getBaselineInstructions("Claude 3.5 Sonnet");
    expect(result).toContain("Claude 3.5 Sonnet");
    expect(result).not.toContain("{{MODEL_NAME}}");
  });

  test("replaces datetime placeholder", () => {
    const result = getBaselineInstructions("TestModel", "America/New_York");
    expect(result).not.toContain("{{CURRENT_DATETIME}}");
    // Should contain a formatted date like "Thursday, December 5, 2024"
    expect(result).toMatch(/\w+day,\s+\w+\s+\d+,\s+\d{4}/);
  });

  test("includes citation instructions when webSearchEnabled", () => {
    const result = getBaselineInstructions("TestModel", "UTC", {
      webSearchEnabled: true,
    });
    expect(result).toContain("CITATIONS:");
    expect(result).toContain("[1]");
  });

  test("excludes citation instructions when webSearchEnabled is false", () => {
    const result = getBaselineInstructions("TestModel", "UTC", {
      webSearchEnabled: false,
    });
    expect(result).not.toContain("CITATIONS:");
  });

  test("excludes citation instructions when options not provided", () => {
    const result = getBaselineInstructions("TestModel");
    expect(result).not.toContain("CITATIONS:");
  });
});

describe("BASELINE_SYSTEM_INSTRUCTIONS", () => {
  test("does not contain UI/Tailwind guidelines", () => {
    expect(BASELINE_SYSTEM_INSTRUCTIONS).not.toContain("Tailwind");
    expect(BASELINE_SYSTEM_INSTRUCTIONS).not.toContain("stack-");
    expect(BASELINE_SYSTEM_INSTRUCTIONS).not.toContain("bg-background");
    expect(BASELINE_SYSTEM_INSTRUCTIONS).not.toContain("shadcn");
  });

  test("contains conciseness guidance", () => {
    expect(BASELINE_SYSTEM_INSTRUCTIONS).toContain("concise");
  });

  test("contains formatting rules", () => {
    expect(BASELINE_SYSTEM_INSTRUCTIONS).toContain("FORMATTING");
    expect(BASELINE_SYSTEM_INSTRUCTIONS).toContain("Code:");
    expect(BASELINE_SYSTEM_INSTRUCTIONS).toContain("Math:");
  });
});
