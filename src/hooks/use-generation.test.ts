import { describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import {
  createChatInputStore,
  setChatInputStoreApi,
  useChatInputStore,
} from "@/stores/chat-input-store";
import { setupZustandTestStore } from "@/test/zustand";
import { renderHook } from "../test/hook-utils";
import { useGenerationMode, useImageParams } from "./use-generation";

const getStore = setupZustandTestStore({
  createStore: () => createChatInputStore(),
  setStore: setChatInputStoreApi,
});

describe("useGeneration hooks", () => {
  test("returns [mode, setMode] from store", () => {
    const { result } = renderHook(() => useGenerationMode());
    expect(result.current[0]).toBe("text");
    expect(typeof result.current[1]).toBe("function");
  });

  test("returns image params and toggles", () => {
    const store = getStore();
    const { result } = renderHook(() => useImageParams());
    expect(result.current.params).toEqual({ prompt: "", model: "" });
    act(() => {
      result.current.setNegativePromptEnabled(true);
    });
    expect(useChatInputStore.getState().negativePromptEnabled).toBe(true);
    act(() => {
      result.current.setParams(prev => ({ ...prev, prompt: "hi" }));
    });
    expect(store.getState().imageParams.prompt).toBe("hi");
  });
});
