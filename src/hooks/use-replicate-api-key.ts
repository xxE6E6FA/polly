import { useMemo } from "react";
import { useUserDataContext } from "@/providers/user-data-context";

type ApiKeyInfo = {
  provider: string;
  hasKey?: boolean;
  encryptedKey?: unknown;
  clientEncryptedKey?: unknown;
};

function hasStoredKey(k: unknown): k is ApiKeyInfo {
  if (k && typeof k === "object") {
    const obj = k as ApiKeyInfo;
    if (typeof obj.hasKey === "boolean") {
      return obj.hasKey;
    }
    return Boolean(obj.encryptedKey || obj.clientEncryptedKey);
  }
  return false;
}

/**
 * Hook to check if the user has a Replicate API key available.
 * Consumes apiKeys from UserDataContext to avoid duplicate queries.
 */
export function useReplicateApiKey() {
  const { apiKeys, user, capabilitiesReady } = useUserDataContext();

  const hasReplicateApiKey = useMemo(() => {
    // Anonymous users can't have API keys
    if (!user || user.isAnonymous) {
      return false;
    }

    // Defensive check - apiKeys may be undefined from stale cache
    if (!(apiKeys && Array.isArray(apiKeys))) {
      return false;
    }

    return apiKeys.some((key: unknown) => {
      if (!hasStoredKey(key)) {
        return false;
      }
      return (key as ApiKeyInfo).provider === "replicate";
    });
  }, [apiKeys, user]);

  return {
    hasReplicateApiKey,
    isLoading: !capabilitiesReady,
  };
}
