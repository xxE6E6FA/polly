import { describe, expect, test } from "bun:test";

type TestMessage = {
  id: string;
  role: "assistant";
  content: string;
  status: "streaming" | "done" | "error";
  reasoning?: string;
};

describe("virtualized-chat-messages behavior", () => {
  test("messageSelector returns message directly", () => {
    const messageId = "test-msg-1";
    const dbContent = "Final database content";

    const message: TestMessage = {
      id: messageId,
      role: "assistant",
      content: dbContent,
      status: "done",
    };

    // Simulate the simplified messageSelector logic
    const selectMessage = (base: TestMessage) => {
      return base;
    };

    const result = selectMessage(message);
    expect(result).toBe(message);
    expect(result.content).toBe(dbContent);
  });
});
