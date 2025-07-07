import { api } from "@convex/_generated/api";
import {
  clearUserModelsCache,
  getCachedUserModels,
  setCachedUserModels,
} from "../lib/user-cache";
import { useConvexWithCache } from "./use-convex-cache";

export function useUserModels() {
  const {
    data: userModelsByProvider,
    isLoading: isLoadingModels,
    refetch: refetchModels,
  } = useConvexWithCache(
    api.userModels.getUserModelsByProvider,
    {},
    {
      queryKey: "userModelsByProvider",
      getCachedData: () => getCachedUserModels()?.userModelsByProvider || null,
      setCachedData: data => {
        if (data) {
          // Get current hasUserModels value to preserve it
          const currentHasModels =
            getCachedUserModels()?.hasUserModels ?? false;
          setCachedUserModels(data, currentHasModels);
        }
      },
      clearCachedData: clearUserModelsCache,
      invalidationEvents: ["user-graduated", "user-models-changed"],
    }
  );

  const {
    data: hasUserModels,
    isLoading: isLoadingHasModels,
    refetch: refetchHasModels,
  } = useConvexWithCache(
    api.userModels.hasUserModels,
    {},
    {
      queryKey: "hasUserModels",
      getCachedData: () => getCachedUserModels()?.hasUserModels ?? null,
      setCachedData: data => {
        if (data !== null) {
          // Get current userModelsByProvider to preserve it
          const currentModels = getCachedUserModels()?.userModelsByProvider;
          if (currentModels) {
            setCachedUserModels(currentModels, data);
          }
        }
      },
      clearCachedData: clearUserModelsCache,
      invalidationEvents: ["user-graduated", "user-models-changed"],
    }
  );

  return {
    userModelsByProvider,
    hasUserModels,
    isLoading: isLoadingModels || isLoadingHasModels,
    refetch: () => {
      refetchModels();
      refetchHasModels();
    },
  };
}
