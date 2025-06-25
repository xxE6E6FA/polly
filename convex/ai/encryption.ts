import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ProviderType } from "./types";
import { CONFIG } from "./config";

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
  provider: ProviderType,
  userId?: Id<"users">
): Promise<string> => {
  if (userId) {
    // Authenticated user - get their API key directly
    const apiKeyRecord = await ctx.runQuery(
      internal.apiKeys.getEncryptedApiKeyData,
      { userId, provider }
    );

    if (apiKeyRecord?.encryptedKey && apiKeyRecord?.initializationVector) {
      return serverDecryptApiKey(
        apiKeyRecord.encryptedKey,
        apiKeyRecord.initializationVector
      );
    }
  }

  // Fall back to environment variable
  const envKey = process.env[CONFIG.PROVIDER_ENV_KEYS[provider]];
  if (envKey) {
    return envKey;
  }

  // Throw appropriate error
  const errorMessage = userId
    ? `No API key found for ${provider}. Please add an API key in Settings.`
    : `Authentication required. Please sign in to use ${provider} models.`;

  throw new Error(errorMessage);
};
