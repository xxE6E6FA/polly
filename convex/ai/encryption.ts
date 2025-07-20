import { api } from "../_generated/api";
import { type ActionCtx } from "../_generated/server";
import { type ProviderType } from "../types";
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
  provider: Exclude<ProviderType, "polly">, // Remove "polly" from allowed types
  modelId?: string
): Promise<string> => {
  const apiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
    provider,
    modelId,
  });

  if (apiKey) {
    return apiKey;
  }

  // Fallback to environment variables
  const envKey = process.env[CONFIG.PROVIDER_ENV_KEYS[provider as keyof typeof CONFIG.PROVIDER_ENV_KEYS]];
  if (envKey) {
    return envKey;
  }

  const authenticatedUser = await ctx.runQuery(api.users.current);
  const errorMessage = authenticatedUser
    ? `No API key found for ${provider}. Please add an API key in Settings.`
    : `Authentication required. Please sign in to use ${provider} models.`;

  throw new Error(errorMessage);
};
