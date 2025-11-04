import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "../test/hook-utils";
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

import { useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useReplicateApiKey } from "./use-replicate-api-key";

describe("useReplicateApiKey", () => {
  test("returns loading true when query undefined", () => {
    useUserDataContextMock = mock(() => ({
      user: { isAnonymous: false },
    }));
    useQueryMock = mock(() => undefined);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasReplicateApiKey).toBe(false);
  });

  test("returns false when no replicate key present", () => {
    useUserDataContextMock = mock(() => ({
      user: { isAnonymous: false },
    }));
    useQueryMock = mock(() => [{ provider: "openai", hasKey: true }]);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(false);
  });

  test("returns true when replicate key exists in array", () => {
    useUserDataContextMock = mock(() => ({
      user: { isAnonymous: false },
    }));
    useQueryMock = mock(() => [
      { provider: "replicate", hasKey: true },
      { provider: "openai", hasKey: true },
    ]);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(true);
  });

  test("returns false when user missing and query skipped", () => {
    useUserDataContextMock = mock(() => ({ user: null }));
    useQueryMock = mock(() => undefined);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(false);
  });
});
