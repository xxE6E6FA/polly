import { beforeEach, describe, expect, it } from "vitest";
import {
  buildKey,
  CACHE_KEYS,
  clearAllPollyKeys,
  clearUserData,
  del,
  get,
  LOCAL_STORAGE_VERSION,
  set,
} from "./local-storage";

describe("local-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("buildKey namespaces with prefix and version", () => {
    const key = buildKey(CACHE_KEYS.userSettings);
    expect(key).toBe(
      `polly:${CACHE_KEYS.userSettings}/v${LOCAL_STORAGE_VERSION}`
    );
  });

  it("get returns fallback when key missing", () => {
    const fallback = { theme: "dark" };
    const value = get(CACHE_KEYS.userSettings, fallback);
    expect(value).toEqual(fallback);
  });

  it("set and get roundtrip value with version envelope", () => {
    const data = { theme: "light", compact: true };
    set(CACHE_KEYS.userSettings, data);

    const storedRaw = localStorage.getItem(buildKey(CACHE_KEYS.userSettings));
    expect(storedRaw).not.toBeNull();

    const parsed = JSON.parse(storedRaw || "");
    expect(parsed).toMatchObject({ version: LOCAL_STORAGE_VERSION, data });

    const read = get(CACHE_KEYS.userSettings, { theme: "dark" });
    expect(read).toEqual(data);
  });

  it("get returns fallback and removes stale versions", () => {
    const namespaced = buildKey(CACHE_KEYS.userSettings);
    const stale = JSON.stringify({
      version: LOCAL_STORAGE_VERSION - 1,
      data: { a: 1 },
    });
    localStorage.setItem(namespaced, stale);

    const fallback = { b: 2 };
    const value = get(CACHE_KEYS.userSettings, fallback);
    expect(value).toEqual(fallback);
    expect(localStorage.getItem(namespaced)).toBeNull();
  });

  it("get returns fallback on corrupt JSON without throwing", () => {
    const namespaced = buildKey(CACHE_KEYS.userSettings);
    localStorage.setItem(namespaced, "not-json");

    const fallback = { ok: true };
    const value = get(CACHE_KEYS.userSettings, fallback);
    expect(value).toEqual(fallback);
    // Corrupt entry may remain; function intentionally ignores errors
    expect(localStorage.getItem(namespaced)).toBe("not-json");
  });

  it("del removes a single namespaced key", () => {
    set(CACHE_KEYS.selectedModel, "gpt-4o");
    const namespaced = buildKey(CACHE_KEYS.selectedModel);
    expect(localStorage.getItem(namespaced)).not.toBeNull();

    del(CACHE_KEYS.selectedModel);
    expect(localStorage.getItem(namespaced)).toBeNull();
  });

  it("clearAllPollyKeys preserves persistent keys only", () => {
    // Persistent keys
    set(CACHE_KEYS.sidebar, { open: true });
    set(CACHE_KEYS.theme, "dark");
    set(CACHE_KEYS.zenDisplayPreferences, { fontSizeIndex: 2 });

    // Non-persistent keys
    set(CACHE_KEYS.apiKeys, { openai: "sk-test" });
    set(CACHE_KEYS.userModels, ["m1"]);
    set(CACHE_KEYS.conversations, [{ id: 1 }]);
    set(CACHE_KEYS.userSettings, { compact: true });

    clearAllPollyKeys();

    // Persistent remain
    expect(localStorage.getItem(buildKey(CACHE_KEYS.sidebar))).not.toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.theme))).not.toBeNull();
    expect(
      localStorage.getItem(buildKey(CACHE_KEYS.zenDisplayPreferences))
    ).not.toBeNull();

    // Others cleared
    expect(localStorage.getItem(buildKey(CACHE_KEYS.apiKeys))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.userModels))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.conversations))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.userSettings))).toBeNull();
  });

  it("clearUserData clears only user-specific keys", () => {
    // Populate a variety of keys
    set(CACHE_KEYS.apiKeys, { openai: "sk-test" });
    set(CACHE_KEYS.userModels, []);
    set(CACHE_KEYS.selectedModel, "gpt-4o");
    set(CACHE_KEYS.conversations, [{ id: 1 }]);
    set(CACHE_KEYS.userSettings, { compact: true });
    set(CACHE_KEYS.setupChecklistDismissed, true);
    set(CACHE_KEYS.userData, { id: "u1" });
    set(CACHE_KEYS.anonymousUserGraduation, { done: true });

    // Persistent keys that should remain
    set(CACHE_KEYS.sidebar, { open: false });
    set(CACHE_KEYS.theme, "light");
    set(CACHE_KEYS.zenDisplayPreferences, { fontSizeIndex: 2 });

    clearUserData();

    // User-specific cleared
    expect(localStorage.getItem(buildKey(CACHE_KEYS.apiKeys))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.userModels))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.selectedModel))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.conversations))).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.userSettings))).toBeNull();
    expect(
      localStorage.getItem(buildKey(CACHE_KEYS.setupChecklistDismissed))
    ).toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.userData))).toBeNull();
    expect(
      localStorage.getItem(buildKey(CACHE_KEYS.anonymousUserGraduation))
    ).toBeNull();

    // Persistent remain
    expect(localStorage.getItem(buildKey(CACHE_KEYS.sidebar))).not.toBeNull();
    expect(localStorage.getItem(buildKey(CACHE_KEYS.theme))).not.toBeNull();
    expect(
      localStorage.getItem(buildKey(CACHE_KEYS.zenDisplayPreferences))
    ).not.toBeNull();
  });
});
