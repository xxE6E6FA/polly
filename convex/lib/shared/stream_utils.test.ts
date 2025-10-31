import { describe, it, expect } from "vitest";
import { isReasoningDelta, humanizeReasoningText } from "./stream_utils";

describe("shared/stream_utils", () => {
  it("detects reasoning delta chunks", () => {
    expect(isReasoningDelta({ type: "reasoning-delta", text: "test" })).toBe(true);
    expect(isReasoningDelta({ type: "text-delta", text: "test" })).toBe(false);
    expect(isReasoningDelta({ type: "reasoning-delta" })).toBe(false);
    expect(isReasoningDelta({ type: "reasoning-delta", text: "" })).toBe(true);
  });

  it("humanizes reasoning text by removing tags and prefixes", () => {
    const raw = "<thinking>Thinking: plan steps</thinking> [reasoning]more[/reasoning]";
    const result = humanizeReasoningText(raw);
    
    expect(result).toBeTruthy();
    expect(result).not.toContain("<thinking>");
    expect(result).not.toContain("</thinking>");
    expect(result).not.toContain("[reasoning]");
    expect(result).not.toContain("[/reasoning]");
    expect(result.toLowerCase()).not.toContain("thinking:");
    expect(result).toContain("plan steps");
    expect(result).toContain("more");
  });
});

