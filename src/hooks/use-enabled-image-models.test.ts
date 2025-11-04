import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { mockModuleWithRestore } from "../test/utils";

let useQueryMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

await mockModuleWithRestore("@/providers/user-data-context", actual => ({
  ...actual,
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useEnabledImageModels } from "./use-enabled-image-models";

describe("useEnabledImageModels", () => {
  test("returns array when user is present and query yields list", () => {
    useUserDataContextMock = mock(() => ({
      user: { _id: "u1" },
    }));
    useQueryMock = mock(() => [
      {
        _id: "m1" as Id<"userImageModels">,
        _creationTime: 1,
        userId: "u1" as Id<"users">,
        modelId: "model1",
        name: "Model 1",
        provider: "replicate",
        createdAt: 1,
      },
      {
        _id: "m2" as Id<"userImageModels">,
        _creationTime: 2,
        userId: "u1" as Id<"users">,
        modelId: "model2",
        name: "Model 2",
        provider: "replicate",
        createdAt: 2,
      },
    ]);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toEqual([
      {
        _id: "m1" as Id<"userImageModels">,
        _creationTime: 1,
        userId: "u1" as Id<"users">,
        modelId: "model1",
        name: "Model 1",
        provider: "replicate",
        createdAt: 1,
      },
      {
        _id: "m2" as Id<"userImageModels">,
        _creationTime: 2,
        userId: "u1" as Id<"users">,
        modelId: "model2",
        name: "Model 2",
        provider: "replicate",
        createdAt: 2,
      },
    ]);
  });

  test("returns undefined when user missing and query skipped", () => {
    useUserDataContextMock = mock(() => ({ user: null }));
    useQueryMock = mock(() => undefined);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toBeUndefined();
  });

  test("returns undefined when query yields non-array", () => {
    useUserDataContextMock = mock(() => ({
      user: { _id: "u1" },
    }));
    useQueryMock = mock(() => undefined);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toBeUndefined();
  });
});
