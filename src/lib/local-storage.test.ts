import { beforeEach, describe, expect, test } from "bun:test";
import {
  buildKey,
  CACHE_KEYS,
  clearAllPollyKeys,
  clearUserData,
  del,
  get,
  set,
} from "./local-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("local-storage utilities", () => {
  test("buildKey namespaces by prefix and version", () => {
    const key = buildKey(CACHE_KEYS.userData);
    expect(key.startsWith("polly:user-data/v")).toBe(true);
  });

  test("set/get round-trip with fallback", () => {
    expect(get(CACHE_KEYS.userData, { foo: 1 })).toEqual({ foo: 1 });
    const value = { foo: 42 };
    set(CACHE_KEYS.userData, value);
    expect(get(CACHE_KEYS.userData, { foo: 0 })).toEqual(value);
  });

  test("del removes key", () => {
    set(CACHE_KEYS.userData, { foo: 1 });
    del(CACHE_KEYS.userData);
    expect(get(CACHE_KEYS.userData, null)).toBeNull();
  });

  test("clearAllPollyKeys preserves persistent keys", () => {
    set(CACHE_KEYS.userData, { foo: 1 });
    set(CACHE_KEYS.sidebar, true); // persistent key
    set(CACHE_KEYS.sidebarWidth, 400);

    clearAllPollyKeys();

    expect(get(CACHE_KEYS.userData, null)).toBeNull();
    expect(get(CACHE_KEYS.sidebarWidth, 0)).toBe(0);
    expect(get(CACHE_KEYS.sidebar, false)).toBe(true);
  });

  test("clearUserData removes user-specific caches", () => {
    set(CACHE_KEYS.userData, { foo: 1 });
    set(CACHE_KEYS.apiKeys, ["a"]);
    set(CACHE_KEYS.sidebar, true);

    clearUserData();

    expect(get(CACHE_KEYS.userData, null)).toBeNull();
    expect(get(CACHE_KEYS.apiKeys, [])).toEqual([]);
    expect(get(CACHE_KEYS.sidebar, false)).toBe(true);
  });
});
