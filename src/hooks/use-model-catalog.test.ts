import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useModelCatalog, useModelCatalogStore } from "./use-model-catalog";

describe("useModelCatalog", () => {
  it("combines user and built-in models and groups by provider/free flag", () => {
    // First hook call: provide arrays for both queries
    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce([
        { _id: "u1", provider: "openai", modelId: "gpt" },
        { _id: "u2", provider: "anthropic", modelId: "claude", free: true },
      ])
      .mockReturnValueOnce([
        { _id: "b1", provider: "google", modelId: "gemini" },
      ]);

    const { result } = renderHook(() => useModelCatalog());
    const { initialized, userModels, modelGroups } = result.current;
    expect(initialized).toBe(true);
    expect(userModels).toHaveLength(3);
    expect(modelGroups.freeModels.map(m => m._id)).toContain("u2");
    expect(modelGroups.providerModels.openai).toBeDefined();
    expect(modelGroups.providerModels.google).toBeDefined();
  });

  it("sets initialized when either query resolves from undefined", () => {
    // Clear the store first
    useModelCatalogStore.getState().clear();

    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    const r1 = renderHook(() => useModelCatalog());
    expect(r1.result.current.initialized).toBe(false);

    // Next render provide data to one query
    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce([{ _id: "u1", provider: "x", modelId: "m" }])
      .mockReturnValueOnce(undefined);
    const r2 = renderHook(() => useModelCatalog());
    expect(r2.result.current.initialized).toBe(true);
  });

  it("store can be cleared", () => {
    useModelCatalogStore.getState().setCatalog([
      {
        _id: "x",
        provider: "p",
        modelId: "m",
      } as unknown as Doc<"userModels">,
    ]);
    expect(useModelCatalogStore.getState().initialized).toBe(true);
    useModelCatalogStore.getState().clear();
    expect(useModelCatalogStore.getState().initialized).toBe(false);
    expect(useModelCatalogStore.getState().userModels).toHaveLength(0);
  });
});
