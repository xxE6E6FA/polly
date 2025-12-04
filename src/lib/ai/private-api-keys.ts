/**
 * API key management for private chat mode
 * Fetches and manages API keys client-side for direct browser streaming
 *
 * Security: Keys are cached with a 5-minute expiration to minimize
 * exposure in memory while still providing reasonable performance.
 */
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback } from "react";
import type { APIKeys } from "@/types";

// Cache entry with expiration timestamp
interface CacheEntry {
  key: string;
  expiresAt: number;
}

// Cache expiration time: 5 minutes (300,000 ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

// API key cache with expiration
const apiKeyCache = new Map<string, CacheEntry>();

/**
 * Clear all cached API keys
 * Call this when switching to/from private mode or on logout
 */
export function clearApiKeyCache(): void {
  apiKeyCache.clear();
}

/**
 * Get a cached key if it exists and hasn't expired
 */
function getCachedKey(cacheKey: string): string | null {
  const entry = apiKeyCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  // Check if entry has expired
  if (Date.now() > entry.expiresAt) {
    apiKeyCache.delete(cacheKey);
    return null;
  }

  return entry.key;
}

/**
 * Set a key in cache with expiration
 */
function setCachedKey(cacheKey: string, key: string): void {
  apiKeyCache.set(cacheKey, {
    key,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function usePrivateApiKeys() {
  const getDecryptedApiKeyAction = useAction(api.apiKeys.getDecryptedApiKey);

  const getApiKey = useCallback(
    async (
      provider:
        | "openai"
        | "anthropic"
        | "google"
        | "groq"
        | "openrouter"
        | "replicate"
        | "elevenlabs",
      modelId?: string
    ): Promise<string | null> => {
      const cacheKey = `${provider}:${modelId || ""}`;

      // Check cache first (with expiration)
      const cachedKey = getCachedKey(cacheKey);
      if (cachedKey) {
        return cachedKey;
      }

      try {
        const decryptedKey = await getDecryptedApiKeyAction({
          provider,
          modelId,
        });

        if (decryptedKey) {
          setCachedKey(cacheKey, decryptedKey);
          return decryptedKey;
        }

        return null;
      } catch (_error) {
        return null;
      }
    },
    [getDecryptedApiKeyAction]
  );

  const getAllApiKeys = useCallback(
    async (
      providers: Array<
        | "openai"
        | "anthropic"
        | "google"
        | "groq"
        | "openrouter"
        | "replicate"
        | "elevenlabs"
      >,
      modelId?: string
    ): Promise<APIKeys> => {
      const keys: APIKeys = {};

      await Promise.all(
        providers.map(async provider => {
          const key = await getApiKey(provider, modelId);
          if (key) {
            keys[provider] = key;
          }
        })
      );

      return keys;
    },
    [getApiKey]
  );

  return {
    getApiKey,
    getAllApiKeys,
    clearCache: clearApiKeyCache,
  };
}
