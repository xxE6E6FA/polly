import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withCache,
  cacheKeys,
  clearAllCache,
  clearCacheByPattern,
  CACHE_TTL,
  LONG_CACHE_TTL,
} from "./cache_utils";

describe("convex/lib/cache_utils", () => {
  beforeEach(() => {
    // reset time and cache before each test
    vi.useRealTimers();
    clearAllCache();
  });

  it("caches values within TTL and refetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const fetcher = vi.fn().mockResolvedValue(42);

    // first call - miss
    await expect(withCache("k1", fetcher, 1000)).resolves.toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // second call before TTL - hit
    await expect(withCache("k1", fetcher, 1000)).resolves.toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // advance beyond TTL
    vi.setSystemTime(new Date(1500));
    await expect(withCache("k1", fetcher, 1000)).resolves.toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears cache entries by pattern", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const f1 = vi.fn().mockResolvedValue("A");
    const f2 = vi.fn().mockResolvedValue("B");

    const kUser = cacheKeys.userModels("u1");
    const kRecent = cacheKeys.recentConversations("u1", 5);

    await withCache(kUser, f1);
    await withCache(kRecent, f2);
    expect(f1).toHaveBeenCalledTimes(1);
    expect(f2).toHaveBeenCalledTimes(1);

    // purge only userModels
    clearCacheByPattern("user_models");

    await withCache(kUser, f1);
    await withCache(kRecent, f2);
    // userModels should refetch, recentConversations should stay cached
    expect(f1).toHaveBeenCalledTimes(2);
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it("clears all cache entries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const f = vi.fn().mockResolvedValue(1);
    await withCache("any", f);
    expect(f).toHaveBeenCalledTimes(1);
    clearAllCache();
    await withCache("any", f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("exposes cache key helpers and TTL constants", () => {
    expect(cacheKeys.userModels("u")).toContain("user_models:u");
    expect(cacheKeys.conversation("c")).toBe("conversation:c");
    expect(cacheKeys.conversationMessages("c", 10)).toBe(
      "conversation_messages:c:10"
    );
    expect(cacheKeys.userStats("u")).toBe("user_stats:u");
    expect(cacheKeys.persona("p")).toBe("persona:p");
    expect(cacheKeys.recentConversations("u", 3)).toBe(
      "recent_conversations:u:3"
    );

    expect(typeof CACHE_TTL).toBe("number");
    expect(typeof LONG_CACHE_TTL).toBe("number");
    expect(LONG_CACHE_TTL).toBeGreaterThan(CACHE_TTL);
  });
});

