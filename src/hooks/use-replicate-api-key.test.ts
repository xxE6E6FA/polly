import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(),
}));

import { useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useReplicateApiKey } from "./use-replicate-api-key";

describe("useReplicateApiKey", () => {
  it("returns loading true when query undefined", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { isAnonymous: false },
    });
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasReplicateApiKey).toBe(false);
  });

  it("returns false when no replicate key present", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { isAnonymous: false },
    });
    (useQuery as unknown as vi.Mock).mockReturnValue([
      { provider: "openai", hasKey: true },
    ]);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(false);
  });

  it("returns true when replicate key exists in array", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { isAnonymous: false },
    });
    (useQuery as unknown as vi.Mock).mockReturnValue([
      { provider: "replicate", hasKey: true },
      { provider: "openai", hasKey: true },
    ]);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(true);
  });

  it("returns false when user missing and query skipped", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({ user: null });
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => useReplicateApiKey());
    expect(result.current.hasReplicateApiKey).toBe(false);
  });
});
