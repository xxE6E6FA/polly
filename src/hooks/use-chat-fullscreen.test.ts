import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@/stores/chat-ui-store", () => ({
  useChatFullscreenUI: vi.fn(() => ({
    isFullscreen: false,
    isMultiline: false,
    isTransitioning: false,
    setFullscreen: vi.fn(),
    setMultiline: vi.fn(),
    setTransitioning: vi.fn(),
    clearOnSend: vi.fn(),
  })),
}));

import { useChatFullscreenUI } from "@/stores/chat-ui-store";
import { useChatFullscreen } from "./use-chat-fullscreen";

describe("useChatFullscreen", () => {
  it("exposes UI flags and callbacks that call underlying store", () => {
    const { result } = renderHook(() => useChatFullscreen());
    const ui = (useChatFullscreenUI as unknown as vi.Mock).mock.results[0]
      .value;
    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isMultiline).toBe(false);
    expect(result.current.isTransitioning).toBe(false);

    result.current.toggleFullscreen();
    expect(ui.setFullscreen).toHaveBeenCalledWith(true);

    result.current.closeFullscreen();
    expect(ui.setFullscreen).toHaveBeenCalledWith(false);

    result.current.onHeightChange(true);
    expect(ui.setMultiline).toHaveBeenCalledWith(true);
  });
});
