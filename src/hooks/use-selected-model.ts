import { useCallback, useRef, useEffect } from "react";

import { api } from "../../convex/_generated/api";
import { type Doc } from "../../convex/_generated/dataModel";
import {
  clearUserCache,
  getCachedSelectedModel,
  setCachedSelectedModel,
} from "../lib/user-cache";
import { useConvexWithOptimizedCache } from "./use-convex-cache";

// Configuration constants
const DEFAULT_OPTIMISTIC_TIMEOUT = 10000; // Increased from 5 seconds to 10 seconds

interface OptimisticUpdateConfig {
  timeoutDuration?: number;
}

export function useSelectedModel(config: OptimisticUpdateConfig = {}) {
  const { timeoutDuration = DEFAULT_OPTIMISTIC_TIMEOUT } = config;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: selectedModel,
    isLoading,
    setOptimisticUpdate,
    clearOptimisticUpdate,
    isOptimistic,
    refetch,
  } = useConvexWithOptimizedCache(
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

  // Clear existing timeout when component unmounts or when clearing optimistic update
  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Enhanced clear function that also clears timeout
  const clearOptimisticUpdateWithTimeout = useCallback(() => {
    clearExistingTimeout();
    clearOptimisticUpdate();
  }, [clearExistingTimeout, clearOptimisticUpdate]);

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

        // Clear any existing timeout
        clearExistingTimeout();

        // Set up fallback timeout with configurable duration
        timeoutRef.current = setTimeout(() => {
          clearOptimisticUpdate();
          timeoutRef.current = null;
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
      clearExistingTimeout,
      clearOptimisticUpdateWithTimeout,
      timeoutDuration,
    ]
  );

  // Cleanup effect to clear timeout on unmount
  useEffect(() => {
    return () => {
      clearExistingTimeout();
    };
  }, [clearExistingTimeout]);

  return {
    selectedModel,
    isLoading,
    isOptimistic,
    selectModelOptimistically,
    clearOptimisticUpdate: clearOptimisticUpdateWithTimeout,
    refetch,
  };
}
