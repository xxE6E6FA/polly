/**
 * API key management for private chat mode
 * Fetches and manages API keys client-side for direct browser streaming
 */
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback } from "react";
import type { APIKeys } from "@/types";

const apiKeyCache = new Map<string, string>();

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

      if (apiKeyCache.has(cacheKey)) {
        return apiKeyCache.get(cacheKey) || null;
      }

      try {
        const decryptedKey = await getDecryptedApiKeyAction({
          provider,
          modelId,
        });

        if (decryptedKey) {
          apiKeyCache.set(cacheKey, decryptedKey);
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
  };
}
