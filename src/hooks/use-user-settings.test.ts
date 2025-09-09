import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  CACHE_KEYS: { userSettings: "user-settings" },
  get: vi.fn(),
  set: vi.fn(),
}));

import { useQuery } from "convex/react";
import { get, set } from "@/lib/local-storage";
import { getInitialUserSettings, useUserSettings } from "./use-user-settings";

describe("useUserSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached settings when query undefined", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    (get as unknown as vi.Mock).mockReturnValue({ theme: "dark" });
    const { result } = renderHook(() => useUserSettings());
    expect(result.current).toEqual({ theme: "dark" });
    expect(get).toHaveBeenCalled();
  });

  it("stores settings to cache when query returns a value", () => {
    const settings = { theme: "light" };
    (useQuery as unknown as vi.Mock).mockReturnValue(settings);
    const { result } = renderHook(() => useUserSettings());
    expect(result.current).toEqual(settings);
    expect(set).toHaveBeenCalledWith("user-settings", settings);
  });

  it("getInitialUserSettings reads from cache with fallback", () => {
    (get as unknown as vi.Mock).mockReturnValue(null);
    expect(getInitialUserSettings()).toBeNull();
    expect(get).toHaveBeenCalled();
  });
});
