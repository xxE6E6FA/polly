import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { renderHook } from "../test/hook-utils";

const useQueryMock = mock();

mock.module("convex/react", () => ({ useQuery: useQueryMock }));

import * as LocalStorageModule from "@/lib/local-storage";
import { getInitialUserSettings, useUserSettings } from "./use-user-settings";

describe("useUserSettings", () => {
  let getSpy: ReturnType<typeof spyOn>;
  let setSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getSpy = spyOn(LocalStorageModule, "get").mockReturnValue(undefined);
    setSpy = spyOn(LocalStorageModule, "set").mockImplementation(() => {
      // Intentional no-op for test mock
    });
  });

  afterEach(() => {
    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  test("returns cached settings when query undefined", () => {
    useQueryMock.mockReturnValue(undefined);
    const cachedSettings = {
      _id: "s1" as any,
      _creationTime: 123,
      userId: "u1" as any,
      personasEnabled: true,
      createdAt: 123,
      updatedAt: 123,
    };
    getSpy.mockReturnValue(cachedSettings);
    const { result } = renderHook(() => useUserSettings());
    expect(result.current).toEqual(cachedSettings);
    expect(getSpy).toHaveBeenCalled();
  });

  test("stores settings to cache when query returns a value", () => {
    const settings = {
      _id: "s1" as any,
      _creationTime: 123,
      userId: "u1" as any,
      personasEnabled: false,
      createdAt: 123,
      updatedAt: 123,
    };
    useQueryMock.mockReturnValue(settings);
    const { result } = renderHook(() => useUserSettings());
    expect(result.current).toEqual(settings);
    expect(setSpy).toHaveBeenCalledWith(
      LocalStorageModule.CACHE_KEYS.userSettings,
      settings
    );
  });

  test("getInitialUserSettings reads from cache with fallback", () => {
    getSpy.mockReturnValue(null as never);
    expect(getInitialUserSettings()).toBeNull();
    expect(getSpy).toHaveBeenCalled();
  });
});
