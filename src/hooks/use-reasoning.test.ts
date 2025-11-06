import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import {
  type ChatInputStoreState,
  createChatInputStore,
  getChatInputStore,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import { selectReasoningConfig, useReasoningConfig } from "./use-reasoning";

let originalStore: ReturnType<typeof getChatInputStore>;

beforeEach(() => {
  // Create isolated store instance for each test
  originalStore = getChatInputStore();
  setChatInputStoreApi(createChatInputStore());
  getChatInputStore().setState({ reasoningConfig: { enabled: false } });
});

afterEach(() => {
  // Restore original store instance
  setChatInputStoreApi(originalStore);
});

describe("useReasoningConfig", () => {
  test.serial("returns current config and setter from store", () => {
    const { result } = renderHook(() => useReasoningConfig());

    const [config, setter] = result.current;
    expect(config).toEqual({ enabled: false });

    act(() => {
      setter({ enabled: true, effort: "high" });
    });

    expect(result.current[0]).toEqual({ enabled: true, effort: "high" });
  });

  test("selectReasoningConfig extracts tuple", () => {
    const mockState = {
      reasoningConfig: { enabled: true, effort: "low" },
      setReasoningConfig: () => {
        /* empty */
      },
      selectedByKey: {},
      setSelectedPersonaId: () => {
        /* empty */
      },
      clearKey: () => {
        /* empty */
      },
      clearAll: () => {
        /* empty */
      },
      temperatureByKey: {},
      setTemperature: () => {
        /* empty */
      },
      clearTemperatureKey: () => {
        /* empty */
      },
      clearAllTemperature: () => {
        /* empty */
      },
    } as unknown as ChatInputStoreState;

    expect(selectReasoningConfig(mockState)).toEqual([
      mockState.reasoningConfig,
      mockState.setReasoningConfig,
    ]);
  });
});
