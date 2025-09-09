import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("@/stores/chat-ui-store", () => ({
  useChatFullscreenUI: vi.fn(),
  useChatHistory: vi.fn(),
}));
vi.mock("@/hooks/use-chat-attachments", () => ({
  useChatAttachments: vi
    .fn()
    .mockReturnValue({ attachments: [], setAttachments: vi.fn() }),
}));
vi.mock("@/hooks/use-chat-input-preservation", () => ({
  useChatInputPreservation: vi.fn().mockReturnValue({
    setChatInputState: vi.fn(),
    getChatInputState: vi.fn().mockReturnValue({ input: "" }),
    clearChatInputState: vi.fn(),
  }),
}));

import { useChatFullscreenUI, useChatHistory } from "@/stores/chat-ui-store";
import { useChatInputState } from "./use-chat-input-state";

describe("useChatInputState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets multiline for new conversation, integrates history and clearOnSend", async () => {
    const setMultiline = vi.fn();
    const clearOnSend = vi.fn();
    (useChatFullscreenUI as ReturnType<typeof vi.fn>).mockReturnValue({
      isFullscreen: false,
      isMultiline: false,
      isTransitioning: false,
      setFullscreen: vi.fn(),
      setMultiline,
      setTransitioning: vi.fn(),
      clearOnSend,
    });

    const prev = vi.fn().mockReturnValue("prev text");
    const next = vi.fn().mockReturnValue(null);
    const resetIndex = vi.fn();
    (useChatHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      prev,
      next,
      resetIndex,
      push: vi.fn(),
      clear: vi.fn(),
    });

    const { result, rerender } = renderHook(
      ({ cid }) =>
        useChatInputState({ conversationId: cid, hasExistingMessages: false }),
      { initialProps: { cid: undefined as Id<"conversations"> | undefined } }
    );

    // New conversation + empty input => reset multiline
    expect(setMultiline).toHaveBeenCalledWith(false);

    // History navigation hooks
    const upHandled = result.current.handleHistoryNavigation();
    expect(upHandled).toBe(true);
    const downHandled = result.current.handleHistoryNavigationDown();
    expect(downHandled).toBe(false);

    // Input change delegates
    act(() => result.current.handleInputChange("hello"));

    // Reset input state calls resetIndex
    act(() => result.current.resetInputState());
    expect(resetIndex).toHaveBeenCalled();

    // Clear on send delegates to UI store
    act(() => result.current.clearOnSend());
    expect(clearOnSend).toHaveBeenCalled();

    // Changing conversationId forces multiline reset again
    await act(async () => rerender({ cid: "c1" as Id<"conversations"> }));
    await act(async () => rerender({ cid: undefined }));
    expect(setMultiline).toHaveBeenCalledWith(false);
  });
});
