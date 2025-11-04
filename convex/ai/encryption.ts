import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
  provider: Exclude<ProviderType, "polly">,
  modelId?: string,
  conversationId?: Id<"conversations">
): Promise<string> => {
  
  // Add retry logic for transient failures
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
        provider,
        modelId,
        conversationId,
      });

      if (apiKey) {
        // Found user API key
        return apiKey;
      }

      // Fallback to environment variables
      const envKeyName = CONFIG.PROVIDER_ENV_KEYS[provider as keyof typeof CONFIG.PROVIDER_ENV_KEYS];
      const envKey = process.env[envKeyName];
      if (envKey) {
        // Found environment API key
        return envKey;
      }

      // If we get here, no API key was found
      throw new Error(`No API key found for ${provider}. Please add an API key in Settings.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Log the attempt for debugging
      console.warn(`API key lookup attempt ${attempt} failed for ${provider}`, {
        error: lastError.message,
        attempt,
        maxRetries,
        provider,
        modelId,
        conversationId,
      });

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait a short time before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error(`No API key found for ${provider}. Please add an API key in Settings.`);
};
