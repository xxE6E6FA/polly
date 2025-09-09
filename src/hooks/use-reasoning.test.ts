import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@/stores/chat-input-store", () => ({
  useChatInputStore: (
    sel: (s: {
      reasoningConfig: { enabled: boolean; effort: string };
      setReasoningConfig: (cfg: unknown) => void;
    }) => unknown
  ) =>
    sel({
      reasoningConfig: { enabled: true, effort: "high" },
      setReasoningConfig: vi.fn(),
    }),
}));

import { useReasoningConfig } from "./use-reasoning";

describe("useReasoningConfig", () => {
  it("returns tuple [config, setter] from store selector", () => {
    const { result } = renderHook(() => useReasoningConfig());
    expect(result.current[0]).toEqual({ enabled: true, effort: "high" });
    expect(typeof result.current[1]).toBe("function");
  });
});
