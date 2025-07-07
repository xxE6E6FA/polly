import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useCallback, useEffect } from "react";
import {
  clearUserCache,
  getCachedSelectedModel,
  setCachedSelectedModel,
} from "../lib/user-cache";
import { useConvexWithCache } from "./use-convex-cache";
import { useOptimisticTimeout } from "./use-timeout-management";

// Configuration constants
const DEFAULT_OPTIMISTIC_TIMEOUT = 10000; // 10 seconds

interface OptimisticUpdateConfig {
  timeoutDuration?: number;
}

export function useSelectedModel(config: OptimisticUpdateConfig = {}) {
  const { timeoutDuration = DEFAULT_OPTIMISTIC_TIMEOUT } = config;
  const { setOptimisticTimeout, clearOptimisticTimeout } =
    useOptimisticTimeout();

  const {
    data: selectedModel,
    isLoading,
    setOptimisticUpdate,
    clearOptimisticUpdate,
    isOptimistic,
    refetch,
  } = useConvexWithCache(
    api.userModels.getUserSelectedModel,
    {},
    {
      queryKey: "selectedModel",
      getCachedData: getCachedSelectedModel,
      setCachedData: setCachedSelectedModel,
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated", "user-models-changed"],
      enableOptimisticUpdates: true,
    }
  );

  // Enhanced clear function that also clears timeout
  const clearOptimisticUpdateWithTimeout = useCallback(() => {
    clearOptimisticTimeout();
    clearOptimisticUpdate();
  }, [clearOptimisticTimeout, clearOptimisticUpdate]);

  // Function to trigger optimistic model selection
  const selectModelOptimistically = useCallback(
    (modelId: string, modelData?: Partial<Doc<"userModels">>) => {
      if (modelData) {
        const optimisticModel: Doc<"userModels"> = {
          _id: modelData._id || ("temp" as Doc<"userModels">["_id"]),
          _creationTime: modelData._creationTime || Date.now(),
          userId: modelData.userId || ("temp" as Doc<"userModels">["userId"]),
          modelId,
          selected: true,
          createdAt: modelData.createdAt || Date.now(),
          ...modelData,
        } as Doc<"userModels">;

        setOptimisticUpdate(optimisticModel);

        // Set up fallback timeout with configurable duration
        setOptimisticTimeout(() => {
          clearOptimisticUpdate();
        }, timeoutDuration);

        // Listen for successful mutation completion to clear optimistic update early
        const handleMutationSuccess = () => {
          clearOptimisticUpdateWithTimeout();
          window.removeEventListener(
            "user-models-changed",
            handleMutationSuccess
          );
        };

        // Listen for the mutation success event
        window.addEventListener("user-models-changed", handleMutationSuccess);
      }
    },
    [
      setOptimisticUpdate,
      clearOptimisticUpdate,
      clearOptimisticUpdateWithTimeout,
      timeoutDuration,
      setOptimisticTimeout,
    ]
  );

  // Cleanup effect to clear timeout on unmount
  useEffect(() => {
    return () => {
      clearOptimisticTimeout();
    };
  }, [clearOptimisticTimeout]);

  return {
    selectedModel,
    isLoading,
    isOptimistic,
    selectModelOptimistically,
    clearOptimisticUpdate: clearOptimisticUpdateWithTimeout,
    refetch,
  };
}
