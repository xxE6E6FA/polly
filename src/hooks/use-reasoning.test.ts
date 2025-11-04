import { describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import {
  createChatInputStore,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import { setupZustandTestStore } from "@/test/zustand";
import { renderHook } from "../test/hook-utils";
import { useReasoningConfig } from "./use-reasoning";

const getStore = setupZustandTestStore({
  createStore: () => createChatInputStore(),
  setStore: setChatInputStoreApi,
});

describe("useReasoningConfig", () => {
  test("returns tuple [config, setter] from store selector", () => {
    const store = getStore();
    store.setState({ reasoningConfig: { enabled: true, effort: "high" } });
    const { result } = renderHook(() => useReasoningConfig());
    expect(result.current[0]).toEqual({ enabled: true, effort: "high" });
    act(() => {
      result.current[1]({ enabled: false, effort: "low" });
    });
    expect(store.getState().reasoningConfig).toEqual({
      enabled: false,
      effort: "low",
    });
  });
});
