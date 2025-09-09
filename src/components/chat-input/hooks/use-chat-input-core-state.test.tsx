import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("@/hooks/use-chat-attachments", () => ({
  useChatAttachments: vi.fn(),
}));
vi.mock("@/hooks/use-chat-input-preservation", () => ({
  useChatInputPreservation: vi.fn(),
}));

import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useChatInputPreservation } from "@/hooks/use-chat-input-preservation";
import type { ConversationId } from "@/types";
import { useChatInputCoreState } from "./use-chat-input-core-state";

describe("useChatInputCoreState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes from preserved state when eligible and syncs changes", () => {
    const setChatInputState = vi.fn();
    const clearChatInputState = vi.fn();
    (useChatInputPreservation as ReturnType<typeof vi.fn>).mockReturnValue({
      setChatInputState,
      getChatInputState: vi.fn().mockReturnValue({ input: "preserved" }),
      clearChatInputState,
    });

    const setAttachments = vi.fn();
    (useChatAttachments as ReturnType<typeof vi.fn>).mockReturnValue({
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

  it("does not use preservation when hasExistingMessages and skips persistence", () => {
    const setChatInputState = vi.fn();
    const clearChatInputState = vi.fn();
    (useChatInputPreservation as ReturnType<typeof vi.fn>).mockReturnValue({
      setChatInputState,
      getChatInputState: vi.fn().mockReturnValue({ input: "ignored" }),
      clearChatInputState,
    });
    (useChatAttachments as ReturnType<typeof vi.fn>).mockReturnValue({
      attachments: [],
      setAttachments: vi.fn(),
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
