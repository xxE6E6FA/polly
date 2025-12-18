import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@/lib/types";

/**
 * Tests for the isStreaming calculation logic.
 *
 * The isStreaming calculation should:
 * 1. Return true ONLY for messages with explicit streaming status (thinking, streaming, searching)
 * 2. Return false for messages with finishReason or stopped flag
 * 3. Return false for messages with undefined/null status (fixes infinite spinning bug)
 */

// Extract the isStreaming calculation logic for testing
function calculateIsStreaming(messages: ChatMessage[]): boolean {
  if (messages.length === 0) {
    return false;
  }

  // Find the most recent assistant message
  let lastAssistant: ChatMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") {
      lastAssistant = message;
      break;
    }
  }

  if (!lastAssistant) {
    return false;
  }

  const status = lastAssistant.status;
  const hasFinish = Boolean(lastAssistant.metadata?.finishReason);
  const isStopped = Boolean(lastAssistant.metadata?.stopped);

  // Only consider streaming if message has an explicit streaming status.
  // This prevents undefined/null/unknown status from being treated as streaming.
  const isActiveStreamingStatus =
    status === "thinking" || status === "streaming" || status === "searching";

  // Message is streaming if it has an active status AND no finish indicator
  return isActiveStreamingStatus && !(hasFinish || isStopped);
}

describe("isStreaming calculation", () => {
  test("returns false for empty messages array", () => {
    expect(calculateIsStreaming([])).toBe(false);
  });

  test("returns false when no assistant message exists", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns true for message with thinking status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: "thinking",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(true);
  });

  test("returns true for message with streaming status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Partial content...",
        status: "streaming",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(true);
  });

  test("returns true for message with searching status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: "searching",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(true);
  });

  test("returns false for message with done status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Complete response",
        status: "done",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for message with error status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: "error",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for message with undefined status (critical fix)", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: undefined,
        createdAt: Date.now(),
      },
    ];
    // This was the bug - undefined status was treated as streaming
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for message with null status", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: null as unknown as ChatMessage["status"],
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for streaming status with finishReason", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Response",
        status: "streaming",
        metadata: { finishReason: "stop" },
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for streaming status with stopped flag", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Partial",
        status: "streaming",
        metadata: { stopped: true },
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("returns false for thinking status with user_stopped finishReason", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: "thinking",
        metadata: { finishReason: "user_stopped" },
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("checks only the most recent assistant message", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Old message",
        status: "done",
        createdAt: Date.now() - 1000,
      },
      {
        id: "2",
        role: "user",
        content: "New question",
        createdAt: Date.now() - 500,
      },
      {
        id: "3",
        role: "assistant",
        content: "",
        status: "thinking",
        createdAt: Date.now(),
      },
    ];
    // Should check the most recent assistant (id: 3), not the old one (id: 1)
    expect(calculateIsStreaming(messages)).toBe(true);
  });

  test("handles message without metadata gracefully", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: Date.now(),
        // No metadata property
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(true);
  });
});

describe("stop and retry scenarios", () => {
  test("after stop: message has finishReason, should not be streaming", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        createdAt: Date.now() - 1000,
      },
      {
        id: "2",
        role: "assistant",
        content: "Partial response...",
        status: "done",
        metadata: { finishReason: "user_stopped", stopped: true },
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(false);
  });

  test("after retry: new message in thinking state should be streaming", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        createdAt: Date.now() - 1000,
      },
      {
        id: "3", // New message ID after retry
        role: "assistant",
        content: "",
        status: "thinking",
        createdAt: Date.now(),
      },
    ];
    expect(calculateIsStreaming(messages)).toBe(true);
  });

  test("edge case: message created without status during retry race condition", () => {
    // This was the bug scenario:
    // 1. Message created without status field
    // 2. Streaming action scheduled but not yet run
    // 3. Frontend checks isStreaming - should return false, not true
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        createdAt: Date.now() - 1000,
      },
      {
        id: "2",
        role: "assistant",
        content: "",
        // status: undefined - not set yet
        createdAt: Date.now(),
      },
    ];
    // Should NOT return true - this was the infinite spinning bug
    expect(calculateIsStreaming(messages)).toBe(false);
  });
});
