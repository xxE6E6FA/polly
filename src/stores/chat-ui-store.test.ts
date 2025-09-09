import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  useChatFullscreenUI,
  useChatHistory,
  useChatUIStore,
} from "./chat-ui-store";

describe("chat-ui-store", () => {
  it("pushes input history and navigates prev/next", () => {
    const id = "conv1";
    const s = useChatUIStore.getState();
    // Early returns
    expect(s.navigateHistory(null, "prev")).toBeNull();
    s.resetHistoryIndex(null);
    s.clearHistory(null);

    s.pushHistory(id, "a");
    s.pushHistory(id, "b");
    s.pushHistory(id, "b"); // duplicate adjacent ignored

    const list = useChatUIStore.getState().historyByConversation[id];
    expect(list).toHaveLength(2);

    // Navigate prev (end) then prev (first)
    expect(s.navigateHistory(id, "prev")).toBe("b");
    expect(s.navigateHistory(id, "prev")).toBe("a");
    // Next moves forward
    expect(s.navigateHistory(id, "next")).toBe("b");

    // Next at end remains clamped
    expect(s.navigateHistory(id, "next")).toBe("b");

    // Reset index
    s.resetHistoryIndex(id);
    expect(s.navigateHistory(id, "prev")).toBe("b");

    // Clear
    s.clearHistory(id);
    expect(useChatUIStore.getState().historyByConversation[id]).toBeUndefined();
  });

  it("limits history to last 50 and resets index", () => {
    const id = "conv2";
    const s = useChatUIStore.getState();
    for (let i = 0; i < 60; i++) {
      s.pushHistory(id, String(i));
    }
    const list = useChatUIStore.getState().historyByConversation[id];
    expect(list.length).toBe(50);
    // After pushHistory, index is reset to null
    expect(useChatUIStore.getState().historyIndexByConversation[id]).toBeNull();
  });

  it("fullscreen/multiline/transitioning toggles and clearOnSend", () => {
    const { result } = renderHook(() => useChatFullscreenUI());
    act(() => {
      result.current.setFullscreen(true);
      result.current.setMultiline(true);
      result.current.setTransitioning(true);
    });
    expect(useChatUIStore.getState().isFullscreen).toBe(true);
    expect(useChatUIStore.getState().isMultiline).toBe(true);
    expect(useChatUIStore.getState().isTransitioning).toBe(true);
    act(() => result.current.clearOnSend());
    expect(useChatUIStore.getState().isFullscreen).toBe(false);
    expect(useChatUIStore.getState().isMultiline).toBe(false);
  });

  it("useChatHistory wrappers delegate to store", () => {
    const id = "conv3";
    const { result } = renderHook(() => useChatHistory(id));
    act(() => {
      result.current.push("x");
      result.current.push("y");
    });
    expect(result.current.prev()).toBe("y");
    expect(result.current.prev()).toBe("x");
    act(() => result.current.resetIndex());
    expect(result.current.prev()).toBe("y");
    act(() => result.current.clear());
    expect(useChatUIStore.getState().historyByConversation[id]).toBeUndefined();
  });
});
