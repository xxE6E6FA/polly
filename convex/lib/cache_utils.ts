// Cache configuration
const CACHE_TTL = 60 * 1000; // 1 minute TTL for most caches
const LONG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for rarely changing data

// In-memory cache for the query context lifetime
const memoryCache = new Map<string, { value: unknown; expires: number }>();

/**
 * Generic cache wrapper for queries
 * Uses in-memory caching during the query execution
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  // Check if we have a valid cached value
  const cached = memoryCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.value as T;
  }

  // Fetch fresh data
  const value = await fetcher();

  // Store in cache
  memoryCache.set(key, {
    value,
    expires: Date.now() + ttl,
  });

  return value;
}

/**
 * Cache key generators for consistent key creation
 */
export const cacheKeys = {
  userModels: (userId: string) => `user_models:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  conversationMessages: (conversationId: string, limit?: number) =>
    `conversation_messages:${conversationId}:${limit || "all"}`,
  userStats: (userId: string) => `user_stats:${userId}`,
  persona: (personaId: string) => `persona:${personaId}`,
  recentConversations: (userId: string, limit: number) =>
    `recent_conversations:${userId}:${limit}`,
};

/**
 * Clear cache entries by pattern
 */
export function clearCacheByPattern(pattern: string) {
  const keysToDelete: string[] = [];

  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => memoryCache.delete(key));
}

/**
 * Clear all cache entries
 */
export function clearAllCache() {
  memoryCache.clear();
}

// Export cache TTL constants for reuse
export { CACHE_TTL, LONG_CACHE_TTL };
