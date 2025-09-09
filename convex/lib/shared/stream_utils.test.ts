import { describe, it, expect } from "vitest";
import {
  isReasoningPart,
  extractReasoningContent,
  humanizeReasoningText,
} from "./stream_utils";

describe("shared/stream_utils", () => {
  it("detects reasoning parts", () => {
    expect(isReasoningPart({ type: "reasoning" })).toBe(true);
    expect(isReasoningPart({ type: "thinking_delta" })).toBe(true);
    expect(isReasoningPart({ type: "thinking" })).toBe(true);
    expect(isReasoningPart({ type: "step-start" })).toBe(true);
    expect(isReasoningPart({ type: "step-finish" })).toBe(true);
    expect(isReasoningPart({ type: "text-delta" })).toBe(false);
  });

  it("extracts reasoning content across shapes", () => {
    // Non-reasoning returns undefined
    expect(extractReasoningContent({ type: "text-delta", textDelta: "x" })).toBeUndefined();

    // Reasoning precedence: textDelta > text > thinking > ""
    expect(
      extractReasoningContent({ type: "reasoning", textDelta: "A", text: "B", thinking: "C" })
    ).toBe("A");
    expect(extractReasoningContent({ type: "thinking", text: "B" })).toBe("B");
    expect(extractReasoningContent({ type: "thinking_delta", thinking: "C" })).toBe("C");
    expect(extractReasoningContent({ type: "step-start" })).toBe("");
  });

  it("humanizes reasoning text by removing tags and prefixes", () => {
    const raw = "<thinking>Thinking: plan steps</thinking> [reasoning]more[/reasoning]";
    expect(humanizeReasoningText(raw)).toBe("plan steps more");
  });
});

