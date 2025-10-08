import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("@/stores/chat-ui-store", () => ({
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

import { useChatHistory } from "@/stores/chat-ui-store";
import { useChatInputState } from "./use-chat-input-state";

describe("useChatInputState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("integrates history handlers and reset helpers", () => {
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

    const { result } = renderHook(
      ({ cid }) =>
        useChatInputState({ conversationId: cid, hasExistingMessages: false }),
      { initialProps: { cid: undefined as Id<"conversations"> | undefined } }
    );

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
  });
});
