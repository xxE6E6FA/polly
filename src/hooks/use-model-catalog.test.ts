import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "../test/hook-utils";

let useQueryMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import type { Doc, Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { setupZustandTestStore } from "@/test/zustand";
import {
  createModelCatalogStore,
  setModelCatalogStoreApi,
  useModelCatalog,
  useModelCatalogStore,
} from "./use-model-catalog";

setupZustandTestStore({
  createStore: () => createModelCatalogStore(),
  setStore: setModelCatalogStoreApi,
});

describe("useModelCatalog", () => {
  test("combines user and built-in models and groups by provider/free flag", () => {
    // First hook call: provide arrays for both queries
    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => [
        { _id: "u1", provider: "openai", modelId: "gpt" },
        { _id: "u2", provider: "anthropic", modelId: "claude", free: true },
      ])
      .mockImplementationOnce(() => [
        { _id: "b1", provider: "google", modelId: "gemini" },
      ]);

    const { result } = renderHook(() => useModelCatalog());
    const { initialized, userModels, modelGroups } = result.current;
    expect(initialized).toBe(true);
    expect(userModels).toHaveLength(3);
    expect(modelGroups.freeModels.map(m => m._id)).toContain(
      "u2" as Id<"userModels">
    );
    expect(modelGroups.providerModels.openai).toBeDefined();
    expect(modelGroups.providerModels.google).toBeDefined();
  });

  test("sets initialized when either query resolves from undefined", () => {
    // Clear the store first
    useModelCatalogStore.getState().clear();

    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined);
    const r1 = renderHook(() => useModelCatalog());
    expect(r1.result.current.initialized).toBe(false);

    // Next render provide data to one query
    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => [
        { _id: "u1", provider: "x", modelId: "m" },
      ])
      .mockImplementationOnce(() => undefined);
    const r2 = renderHook(() => useModelCatalog());
    expect(r2.result.current.initialized).toBe(true);
  });

  test("store can be cleared", () => {
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
