import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderHook } from "../test/hook-utils";
import { useChatStateMachine } from "./use-chat-state-machine";

describe("useChatStateMachine", () => {
  it("transitions through sending → streaming → end", () => {
    const { result } = renderHook(() => useChatStateMachine());
    expect(result.current.chatStatus).toBe("idle");
    expect(result.current.isIdle).toBe(true);

    act(() => result.current.actions.sendMessage("m1"));
    expect(result.current.chatStatus).toBe("sending");
    expect(result.current.isSending).toBe(true);
    expect(result.current.currentMessageId).toBe("m1");

    act(() => result.current.actions.startStreaming("m1"));
    expect(result.current.chatStatus).toBe("streaming");
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.streamContent).toBe("");

    act(() => result.current.actions.addStreamChunk("Hello "));
    act(() => result.current.actions.addStreamChunk("World"));
    expect(result.current.streamContent).toBe("Hello World");

    act(() => result.current.actions.endStreaming());
    expect(result.current.chatStatus).toBe("idle");
    expect(result.current.isIdle).toBe(true);
  });

  it("handles error and stop/reset transitions", () => {
    const { result } = renderHook(() => useChatStateMachine());

    act(() => result.current.actions.startStreaming("m2"));
    expect(result.current.isStreaming).toBe(true);
    act(() => result.current.actions.stopGeneration());
    expect(result.current.chatStatus).toBe("stopped");
    expect(result.current.currentMessageId).toBe("m2");

    act(() => result.current.actions.setError(new Error("boom"), false));
    expect(result.current.hasError).toBe(true);
    expect(result.current.canRetry).toBe(false);

    act(() => result.current.actions.reset());
    expect(result.current.chatStatus).toBe("idle");
    expect(result.current.isIdle).toBe(true);
  });
});
