import { describe, expect, it } from "vitest";
import { useInitChatInputStore } from "./init-chat-input-store";

describe("stores/init-chat-input-store", () => {
  it("is a no-op initializer that runs without errors", () => {
    expect(() => useInitChatInputStore()).not.toThrow();
  });
});
