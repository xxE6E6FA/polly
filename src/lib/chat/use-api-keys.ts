/**
 * Shared API key management for private chat mode
 */
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback } from "react";

export function useApiKeys() {
  // Get decrypted API key action for private mode
  const getDecryptedApiKeyAction = useAction(api.apiKeys.getDecryptedApiKey);

  // Wrapper function to match the expected signature
  const getDecryptedApiKey = useCallback(
    async (args: { provider: string; modelId: string }) => {
      return await getDecryptedApiKeyAction({
        provider: args.provider as
          | "openai"
          | "anthropic"
          | "google"
          | "openrouter"
          | "replicate",
        modelId: args.modelId,
      });
    },
    [getDecryptedApiKeyAction]
  );

  return {
    getDecryptedApiKey,
  };
}
