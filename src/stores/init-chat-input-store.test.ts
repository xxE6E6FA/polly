import { describe, expect, test } from "bun:test";
import { useInitChatInputStore } from "./init-chat-input-store";

describe("stores/init-chat-input-store", () => {
  test("is a no-op initializer that runs without errors", () => {
    expect(() => useInitChatInputStore()).not.toThrow();
  });
});
