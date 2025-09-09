import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(),
}));

import { useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useEnabledImageModels } from "./use-enabled-image-models";

describe("useEnabledImageModels", () => {
  it("returns array when user is present and query yields list", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { _id: "u1" },
    });
    (useQuery as unknown as vi.Mock).mockReturnValue([
      { id: "m1" },
      { id: "m2" },
    ]);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toEqual([{ id: "m1" }, { id: "m2" }]);
  });

  it("returns undefined when user missing and query skipped", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({ user: null });
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when query yields non-array", () => {
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { _id: "u1" },
    });
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);

    const { result } = renderHook(() => useEnabledImageModels());
    expect(result.current).toBeUndefined();
  });
});
