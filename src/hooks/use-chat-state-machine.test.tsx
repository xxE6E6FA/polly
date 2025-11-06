import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useChatStateMachine } from "./use-chat-state-machine";

describe("useChatStateMachine", () => {
  test("handles send and stream lifecycle", () => {
    const { result } = renderHook(() => useChatStateMachine());

    expect(result.current.isIdle).toBe(true);

    act(() => {
      result.current.actions.sendMessage("msg-1");
    });

    expect(result.current.isSending).toBe(true);
    expect(result.current.currentMessageId).toBe("msg-1");

    act(() => {
      result.current.actions.startStreaming("msg-1");
      result.current.actions.addStreamChunk("Hello");
      result.current.actions.addStreamChunk(" World");
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.streamContent).toBe("Hello World");

    act(() => {
      result.current.actions.stopGeneration();
    });

    expect(result.current.isStopped).toBe(true);
    expect(result.current.currentMessageId).toBe("msg-1");

    act(() => {
      result.current.actions.reset();
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.currentMessageId).toBeNull();
  });

  test("sets error and retry flags", () => {
    const { result } = renderHook(() => useChatStateMachine());
    const error = new Error("boom");

    act(() => {
      result.current.actions.setError(error, false);
    });

    expect(result.current.hasError).toBe(true);
    expect(result.current.error).toBe(error);
    expect(result.current.canRetry).toBe(false);
  });
});
