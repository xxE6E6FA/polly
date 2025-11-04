import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";

let useChatAttachmentsMock: ReturnType<typeof mock>;
let useChatInputPreservationMock: ReturnType<typeof mock>;

mock.module("@/hooks/use-chat-attachments", () => ({
  useChatAttachments: (...args: unknown[]) => useChatAttachmentsMock(...args),
}));
mock.module("@/hooks/use-chat-input-preservation", () => ({
  useChatInputPreservation: (...args: unknown[]) =>
    useChatInputPreservationMock(...args),
}));

import type { ConversationId } from "@/types";
import { useChatInputCoreState } from "./use-chat-input-core-state";

describe("useChatInputCoreState", () => {
  beforeEach(() => {
    useChatAttachmentsMock = mock();
    useChatInputPreservationMock = mock();
  });

  test("initializes from preserved state when eligible and syncs changes", () => {
    const setChatInputState = mock();
    const clearChatInputState = mock();
    useChatInputPreservationMock.mockReturnValue({
      setChatInputState,
      getChatInputState: mock().mockReturnValue({ input: "preserved" }),
      clearChatInputState,
    });

    const setAttachments = mock();
    useChatAttachmentsMock.mockReturnValue({
      attachments: [{ type: "text", name: "a.txt" }],
      setAttachments,
    });

    const { result } = renderHook(() =>
      useChatInputCoreState({
        conversationId: "c1" as ConversationId,
        hasExistingMessages: false,
      })
    );

    expect(result.current.shouldUsePreservedState).toBeTruthy();
    expect(result.current.input).toBe("preserved");
    // Effect writes preserved state on mount
    expect(setChatInputState).toHaveBeenCalledWith(
      { input: "preserved" },
      "c1"
    );

    // setInput updates input and preserved state
    act(() => result.current.setInput("new text"));
    expect(setChatInputState).toHaveBeenCalledWith({ input: "new text" }, "c1");

    // setAttachments proxies to attachments store
    const nextAttachments = [
      {
        type: "image" as const,
        name: "img.png",
        mimeType: "image/png",
        url: "http://example.com/img.png",
        size: 1024,
      },
    ];
    act(() => result.current.setAttachments(nextAttachments));
    expect(setAttachments).toHaveBeenCalledWith(nextAttachments);

    // resetCoreState clears and clears preserved state
    act(() => {
      result.current.resetCoreState();
    });
    expect(result.current.input).toBe("");
    expect(clearChatInputState).toHaveBeenCalled();
  });

  test("does not use preservation when hasExistingMessages and skips persistence", () => {
    const setChatInputState = mock();
    const clearChatInputState = mock();
    useChatInputPreservationMock.mockReturnValue({
      setChatInputState,
      getChatInputState: mock().mockReturnValue({ input: "ignored" }),
      clearChatInputState,
    });
    useChatAttachmentsMock.mockReturnValue({
      attachments: [],
      setAttachments: mock(),
    });

    const { result } = renderHook(() =>
      useChatInputCoreState({
        conversationId: "c1" as ConversationId,
        hasExistingMessages: true,
      })
    );

    expect(result.current.shouldUsePreservedState).toBeFalsy();
    expect(result.current.input).toBe("");
    act(() => result.current.setInput("x"));
    expect(setChatInputState).not.toHaveBeenCalled();

    // Calling reset should not clear preserved state when not using it
    act(() => result.current.resetCoreState());
    expect(clearChatInputState).not.toHaveBeenCalled();
  });
});
