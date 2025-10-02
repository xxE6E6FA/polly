import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@/providers/toast-context", () => ({ useToast: vi.fn() }));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  CACHE_KEYS: { selectedModel: "selectedModel" },
  set: vi.fn(),
}));

import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { set } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";
import { useSelectModel } from "./use-select-model";

describe("useSelectModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets localStorage cache when catalog contains model and calls mutation", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useToast as unknown as vi.Mock).mockReturnValue({ error: vi.fn() });

    const catalog = [
      { modelId: "gpt", provider: "openai", _id: "a" as Id<"userModels"> },
      { modelId: "other", provider: "x", _id: "b" as Id<"userModels"> },
    ] as Array<Doc<"userModels">>;

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("gpt", "openai", catalog);
    expect(set).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith({ modelId: "gpt", provider: "openai" });
  });

  it("does not cache when catalog is missing but still calls mutation", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useToast as unknown as vi.Mock).mockReturnValue({ error: vi.fn() });

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("m", "p");
    expect(set).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith({ modelId: "m", provider: "p" });
  });

  it("shows toast on mutation error", async () => {
    const mutate = vi.fn().mockRejectedValue(new Error("fail"));
    const error = vi.fn();
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useToast as unknown as vi.Mock).mockReturnValue({ error });

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("m", "p", []);
    expect(error).toHaveBeenCalled();
  });
});
