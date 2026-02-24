import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ProviderType } from "../types";
import { CONFIG } from "./config";

// ── Module-level API key cache ───────────────────────────────────────
// Convex reuses Node.js processes, so module-level state persists across
// invocations within the same isolate. TTL prevents stale keys.
const API_KEY_CACHE_TTL_MS = 60 * 1000; // 1 minute — short TTL to handle key rotation promptly
const API_KEY_CACHE_MAX_ENTRIES = 100;
const apiKeyCache = new Map<string, { key: string; expiresAt: number }>();

function getCachedApiKey(userId: string, provider: string): string | undefined {
  const cacheKey = `${userId}_${provider}`;
  const entry = apiKeyCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    apiKeyCache.delete(cacheKey);
    return undefined;
  }
  return entry.key;
}

function setCachedApiKey(userId: string, provider: string, key: string): void {
  // Evict oldest entries if at capacity
  if (apiKeyCache.size >= API_KEY_CACHE_MAX_ENTRIES) {
    const firstKey = apiKeyCache.keys().next().value;
    if (firstKey) apiKeyCache.delete(firstKey);
  }
  apiKeyCache.set(`${userId}_${provider}`, {
    key,
    expiresAt: Date.now() + API_KEY_CACHE_TTL_MS,
  });
}

/** Invalidate a cached API key (e.g. after key rotation/deletion). */
export function invalidateCachedApiKey(userId: string, provider: string): void {
  apiKeyCache.delete(`${userId}_${provider}`);
}

export const serverDecryptApiKey = async (
  encryptedKey: number[],
  initializationVector: number[]
): Promise<string> => {
  const encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!encryptionSecret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET environment variable is required"
    );
  }

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(encryptionSecret);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey("raw", hash, CONFIG.AES, false, [
    "encrypt",
    "decrypt",
  ]);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(initializationVector) },
    key,
    new Uint8Array(encryptedKey)
  );

  return new TextDecoder().decode(decrypted);
};

export const getApiKey = async (
  ctx: ActionCtx,
  provider: Exclude<ProviderType, "polly">,
  _modelId?: string,
  conversationId?: Id<"conversations">,
  userId?: Id<"users">
): Promise<string> => {
  // Resolve userId: prefer passed-in, then fall back to conversation lookup
  let resolvedUserId = userId ?? null;

  if (!resolvedUserId && conversationId) {
    try {
      const conversation = await ctx.runQuery(
        internal.conversations.internalGet,
        { id: conversationId }
      );
      resolvedUserId = conversation?.userId || null;
    } catch (error) {
      console.warn("Failed to get user from conversation for API key lookup", error);
    }
  }

  // Try user's custom API key via direct query + inline decryption
  if (resolvedUserId) {
    // Check module-level cache first
    const cached = getCachedApiKey(resolvedUserId, provider);
    if (cached) return cached;

    try {
      const apiKeyRecord = await ctx.runQuery(
        internal.apiKeys.getEncryptedApiKeyData,
        { userId: resolvedUserId, provider }
      );

      if (apiKeyRecord?.encryptedKey && apiKeyRecord.initializationVector) {
        const decryptedKey = await serverDecryptApiKey(
          apiKeyRecord.encryptedKey,
          apiKeyRecord.initializationVector
        );
        setCachedApiKey(resolvedUserId, provider, decryptedKey);
        return decryptedKey;
      }
    } catch (error) {
      console.warn(`Failed to lookup/decrypt user API key for ${provider}`, error);
    }
  }

  // Fallback to environment variables
  const envKeyName = CONFIG.PROVIDER_ENV_KEYS[provider as keyof typeof CONFIG.PROVIDER_ENV_KEYS];
  const envKey = process.env[envKeyName];
  if (envKey) {
    return envKey;
  }

  throw new Error(`No API key found for ${provider}. Please add an API key in Settings.`);
};
