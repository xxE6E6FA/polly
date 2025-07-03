import { api } from "../../convex/_generated/api";
import {
  getCachedUserModels,
  setCachedUserModels,
  clearUserModelsCache,
} from "../lib/user-cache";
import { useConvexWithOptimizedCache } from "./use-convex-cache";

export function useUserModels() {
  const {
    data: userModelsByProvider,
    isLoading: isLoadingModels,
    refetch: refetchModels,
  } = useConvexWithOptimizedCache(
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
  } = useConvexWithOptimizedCache(
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
