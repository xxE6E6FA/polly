import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("@/stores/chat-ui-store", () => ({
  useChatFullscreenUI: vi.fn(),
}));

import { useChatFullscreenUI } from "@/stores/chat-ui-store";
import { useChatInputFullscreen } from "./use-chat-input-fullscreen";

describe("useChatInputFullscreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it("maps UI store and toggles fullscreen with transitioning window", () => {
    const setFullscreen = vi.fn();
    const setMultiline = vi.fn();
    const setTransitioning = vi.fn();
    const clearOnSend = vi.fn();
    (useChatFullscreenUI as unknown as Mock).mockReturnValue({
      isFullscreen: false,
      isMultiline: false,
      isTransitioning: false,
      setFullscreen,
      setMultiline,
      setTransitioning,
      clearOnSend,
    });

    const { result } = renderHook(() => useChatInputFullscreen());

    // Height change delegates to setMultiline
    act(() => result.current.handleHeightChange(true));
    expect(setMultiline).toHaveBeenCalledWith(true);

    // Toggle fullscreen flips value and manages transition flag
    act(() => result.current.handleToggleFullscreen());
    expect(setTransitioning).toHaveBeenCalledWith(true);
    expect(setFullscreen).toHaveBeenCalledWith(true);
    act(() => vi.advanceTimersByTime(380));
    expect(setTransitioning).toHaveBeenLastCalledWith(false);

    // Close fullscreen explicitly
    act(() => result.current.handleCloseFullscreen());
    expect(setTransitioning).toHaveBeenCalledWith(true);
    expect(setFullscreen).toHaveBeenCalledWith(false);
    act(() => vi.advanceTimersByTime(380));
    expect(setTransitioning).toHaveBeenLastCalledWith(false);

    // Ensure aliases exist and are the same functions
    expect(result.current.onHeightChange).toBe(
      result.current.handleHeightChange
    );
    expect(result.current.toggleFullscreen).toBe(
      result.current.handleToggleFullscreen
    );
    expect(result.current.closeFullscreen).toBe(
      result.current.handleCloseFullscreen
    );

    // Pass-through clearOnSend
    expect(typeof result.current.clearOnSend).toBe("function");
  });
});
