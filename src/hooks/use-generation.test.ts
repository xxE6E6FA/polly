import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@/stores/chat-input-store", () => ({
  useChatInputStore: vi.fn(selector =>
    selector({
      generationMode: "text",
      setGenerationMode: vi.fn(),
      imageParams: { prompt: "", model: "" },
      setImageParams: vi.fn(),
      negativePromptEnabled: false,
      setNegativePromptEnabled: vi.fn(),
    })
  ),
}));

import { useGenerationMode, useImageParams } from "./use-generation";

describe("useGeneration hooks", () => {
  it("returns [mode, setMode] from store", () => {
    const { result } = renderHook(() => useGenerationMode());
    expect(result.current[0]).toBe("text");
    expect(typeof result.current[1]).toBe("function");
  });

  it("returns image params and toggles", () => {
    const { result } = renderHook(() => useImageParams());
    expect(result.current.params).toEqual({ prompt: "", model: "" });
    result.current.setNegativePromptEnabled(true);
    expect(result.current.setNegativePromptEnabled).toHaveBeenCalledWith(true);
  });
});
