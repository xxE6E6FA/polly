import { beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import {
  type ChatInputStoreState,
  getChatInputStore,
} from "@/stores/chat-input-store";
import { selectReasoningConfig, useReasoningConfig } from "./use-reasoning";

describe("useReasoningConfig", () => {
  beforeEach(() => {
    getChatInputStore().setState({ reasoningConfig: { enabled: false } });
  });

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
