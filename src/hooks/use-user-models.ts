import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { useUserDataContext } from "@/providers/user-data-context";
import type { AIModel } from "@/types";

export function useUserModels() {
  const { user } = useUserDataContext();

  const userModelsRaw = useQuery(
    api.userModels.getAvailableModels,
    user?._id ? {} : "skip"
  );

  const userModels = useMemo(
    () => userModelsRaw ?? get(CACHE_KEYS.userModels, []),
    [userModelsRaw]
  );

  useEffect(() => {
    if (
      userModelsRaw &&
      Array.isArray(userModelsRaw) &&
      userModelsRaw.length > 0
    ) {
      set(CACHE_KEYS.userModels, userModelsRaw);
    }
  }, [userModelsRaw]);

  const userModelsByProvider = useMemo(() => {
    const grouped: Record<string, AIModel[]> = {};

    userModels.forEach(model => {
      if (!model) {
        return;
      }

      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

    return grouped;
  }, [userModels]);

  return {
    userModels,
    userModelsByProvider,
  };
}
