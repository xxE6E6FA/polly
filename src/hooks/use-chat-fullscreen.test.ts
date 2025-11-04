import { describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import {
  createChatUIStore,
  setChatUIStoreApi,
  useChatFullscreenUI,
} from "@/stores/chat-ui-store";
import { setupZustandTestStore } from "@/test/zustand";
import { renderHook } from "../test/hook-utils";
import { useChatFullscreen } from "./use-chat-fullscreen";

const getStore = setupZustandTestStore({
  createStore: () => createChatUIStore(),
  setStore: setChatUIStoreApi,
});

describe("useChatFullscreen", () => {
  test("exposes UI flags and callbacks that drive the store", () => {
    const store = getStore();
    const { result } = renderHook(() => useChatFullscreen());

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isMultiline).toBe(false);
    expect(result.current.isTransitioning).toBe(false);

    act(() => {
      result.current.toggleFullscreen();
    });
    expect(store.getState().isFullscreen).toBe(true);

    act(() => {
      result.current.closeFullscreen();
    });
    expect(store.getState().isFullscreen).toBe(false);

    act(() => {
      result.current.onHeightChange(true);
    });
    expect(store.getState().isMultiline).toBe(true);

    act(() => {
      result.current.setTransitioning(true);
    });
    expect(store.getState().isTransitioning).toBe(true);
    expect(result.current.isTransitioning).toBe(true);
  });
});
