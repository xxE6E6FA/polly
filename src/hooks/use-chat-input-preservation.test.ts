import type { Id } from "@convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import { renderHook } from "../test/hook-utils";
import { useChatInputPreservation } from "./use-chat-input-preservation";

describe("useChatInputPreservation", () => {
  it("sets and gets global state without causing re-renders", () => {
    const { result } = renderHook(() => useChatInputPreservation());
    expect(result.current.getChatInputState()).toMatchObject({ input: "" });
    result.current.setChatInputState({ input: "hello" });
    expect(result.current.getChatInputState().input).toBe("hello");
  });

  it("stores per-conversation state and clears individually or all", () => {
    const { result } = renderHook(() => useChatInputPreservation());
    result.current.setChatInputState(
      { input: "a" },
      "c1" as Id<"conversations">
    );
    result.current.setChatInputState(
      { input: "b" },
      "c2" as Id<"conversations">
    );
    expect(
      result.current.getChatInputState("c1" as Id<"conversations">).input
    ).toBe("a");
    expect(
      result.current.getChatInputState("c2" as Id<"conversations">).input
    ).toBe("b");

    result.current.clearChatInputState("c1" as Id<"conversations">);
    expect(
      result.current.getChatInputState("c1" as Id<"conversations">).input
    ).toBe("");

    result.current.clearAllConversationStates();
    expect(
      result.current.getChatInputState("c2" as Id<"conversations">).input
    ).toBe("");
    expect(result.current.getChatInputState().input).toBe("");
  });
});
