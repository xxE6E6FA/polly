import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
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
 * Hook to check if the user has a Replicate API key available
 */
export function useReplicateApiKey() {
  const { user } = useUserDataContext();

  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );

  const hasReplicateApiKey = useMemo(() => {
    if (!apiKeysRaw) {
      return false;
    }

    if (!Array.isArray(apiKeysRaw)) {
      return false;
    }

    return apiKeysRaw.some((key: unknown) => {
      if (!hasStoredKey(key)) {
        return false;
      }
      return (key as ApiKeyInfo).provider === "replicate";
    });
  }, [apiKeysRaw]);

  return {
    hasReplicateApiKey,
    isLoading: apiKeysRaw === undefined,
  };
}
