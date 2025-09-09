import { describe, it, expect, vi } from "vitest";
import {
  processAnthropicStream,
  convertToAnthropicMessages,
  calculateAnthropicMaxTokens,
  type AnthropicStreamEvent,
} from "./anthropic_stream";

async function* makeEvents(events: AnthropicStreamEvent[]) {
  for (const e of events) yield e;
}

describe("shared/anthropic_stream", () => {
  it("processes stream events and invokes callbacks", async () => {
    const textChunks: string[] = [];
    const thinkingChunks: string[] = [];
    const finishCalls: any[] = [];

    const callbacks = {
      onTextDelta: (t: string) => void textChunks.push(t),
      onThinkingDelta: (t: string) => void thinkingChunks.push(t),
      onFinish: (data: any) => void finishCalls.push(data),
      checkAbort: () => false,
    } as const;

    const events: AnthropicStreamEvent[] = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Reason" } },
      { type: "message_delta", delta: { stop_reason: "end" } },
    ];

    await processAnthropicStream(makeEvents(events), callbacks);

    expect(textChunks).toEqual(["Hello"]);
    expect(thinkingChunks).toEqual(["Reason"]);
    expect(finishCalls).toEqual([{ text: "Hello", reasoning: "Reason", finishReason: "end" }]);
  });

  it("aborts stream when checkAbort returns true", async () => {
    const callbacks = {
      onTextDelta: vi.fn(),
      onThinkingDelta: vi.fn(),
      onFinish: vi.fn(),
      checkAbort: () => true,
    } as const;

    const events: AnthropicStreamEvent[] = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
    ];

    await expect(processAnthropicStream(makeEvents(events), callbacks)).rejects.toThrow(
      "StoppedByUser"
    );
  });

  it("converts messages excluding system and stringifies content", () => {
    const out = convertToAnthropicMessages([
      { role: "system", content: "ignored" },
      { role: "user", content: "hi" },
      { role: "assistant", content: { k: 1 } },
    ]);

    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "{\"k\":1}" },
    ]);
  });

  it("calculates max tokens with defaults and budgets", () => {
    // Default wins if budget is small
    expect(calculateAnthropicMaxTokens(undefined, 1000)).toBe(16384);
    // Budget + buffer wins when larger than default
    expect(calculateAnthropicMaxTokens(undefined, 25000)).toBe(25000 + 4096);
    // Base max wins when larger than budget+buffer
    expect(calculateAnthropicMaxTokens(50000, 10000)).toBe(50000);
  });
});

