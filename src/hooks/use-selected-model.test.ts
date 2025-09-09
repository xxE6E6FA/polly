import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  CACHE_KEYS: { selectedModel: "selectedModel" },
  get: vi.fn(),
}));
vi.mock("@/stores/chat-input-store", () => ({ useChatInputStore: vi.fn() }));

import { useQuery } from "convex/react";
import { get } from "@/lib/local-storage";
import { useChatInputStore } from "@/stores/chat-input-store";
import { useSelectedModel } from "./use-selected-model";

describe("useSelectedModel", () => {
  let selected: unknown = null;
  const setSelected = vi.fn((m: unknown) => {
    selected = m;
  });

  beforeEach(() => {
    selected = null;
    setSelected.mockClear();
    (useChatInputStore as unknown as vi.Mock).mockImplementation(
      (
        sel: (s: {
          selectedModel: unknown;
          setSelectedModel: (m: unknown) => void;
        }) => unknown
      ) => sel({ selectedModel: selected, setSelectedModel: setSelected })
    );
  });

  it("hydrates from server when available", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue({
      modelId: "gpt",
      provider: "openai",
    });
    const { result } = renderHook(() => useSelectedModel());
    expect(setSelected).toHaveBeenCalledWith({
      modelId: "gpt",
      provider: "openai",
    });
    expect(result.current[0]).toBeNull(); // selector uses initial selected before effect runs
  });

  it("falls back to local cache when server undefined and state empty", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    (get as unknown as vi.Mock).mockReturnValue({
      modelId: "cached",
      provider: "google",
    });

    renderHook(() => useSelectedModel());
    expect(setSelected).toHaveBeenCalledWith({
      modelId: "cached",
      provider: "google",
    });
  });

  it("does not overwrite when already selected and no server value", () => {
    selected = { modelId: "keep", provider: "x" };
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    (get as unknown as vi.Mock).mockReturnValue({
      modelId: "cached",
      provider: "y",
    });

    renderHook(() => useSelectedModel());
    expect(setSelected).not.toHaveBeenCalled();
  });
});
