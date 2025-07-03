import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
  useAction as useConvexAction,
} from "convex/react";
import { type FunctionReference } from "convex/server";

/**
 * Hook that combines Convex queries with React Query caching patterns
 */
interface ConvexCacheOptions<TData> {
  queryKey: string | string[];
  getCachedData?: () => TData | null;
  setCachedData?: (data: TData) => void;
  clearCachedData?: () => void;
  invalidationEvents?: string[];
  enableOptimisticUpdates?: boolean;
}

// Helper function to normalize query keys
function normalizeQueryKey(queryKey: string | string[]): string[] {
  return Array.isArray(queryKey) ? queryKey : [queryKey];
}

export function useConvexWithCache<
  TData = unknown,
  TArgs = Record<string, unknown>,
>(
  convexQuery: FunctionReference<"query">,
  args: TArgs | "skip",
  options: ConvexCacheOptions<TData>
) {
  const {
    queryKey,
    getCachedData,
    setCachedData,
    clearCachedData,
    invalidationEvents = [],
    enableOptimisticUpdates = false,
  } = options;

  // Local cache for instant rendering
  const [localCache, setLocalCache] = useState<TData | null>(() => {
    if (typeof window === "undefined" || !getCachedData) {
      return null;
    }
    return getCachedData();
  });

  // Optimistic updates
  const [optimisticData, setOptimisticData] = useState<TData | null>(null);

  // Convex query
  const convexData = useConvexQuery(convexQuery, args);

  // Query client for cache management
  const queryClient = useQueryClient();

  // Update caches when fresh data arrives
  useEffect(() => {
    if (convexData !== undefined) {
      const key = normalizeQueryKey(queryKey);
      queryClient.setQueryData(key, convexData);

      if (setCachedData) {
        setCachedData(convexData);
        setLocalCache(convexData);
      }

      if (enableOptimisticUpdates) {
        setOptimisticData(null);
      }
    }
  }, [
    convexData,
    queryKey,
    queryClient,
    setCachedData,
    enableOptimisticUpdates,
  ]);

  // Handle invalidation events
  useEffect(() => {
    if (typeof window === "undefined" || invalidationEvents.length === 0) {
      return;
    }

    const handleInvalidation = () => {
      const key = normalizeQueryKey(queryKey);
      queryClient.invalidateQueries({ queryKey: key });

      if (clearCachedData) {
        clearCachedData();
        setLocalCache(null);
      }

      if (enableOptimisticUpdates) {
        setOptimisticData(null);
      }
    };

    const eventHandlers = invalidationEvents.map(eventName => {
      const handler = () => handleInvalidation();
      window.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      eventHandlers.forEach(({ eventName, handler }) => {
        window.removeEventListener(eventName, handler);
      });
    };
  }, [
    invalidationEvents,
    queryKey,
    queryClient,
    clearCachedData,
    enableOptimisticUpdates,
  ]);

  // Optimistic update helpers
  const setOptimisticUpdate = useCallback(
    (data: TData) => {
      if (enableOptimisticUpdates) {
        setOptimisticData(data);
      }
    },
    [enableOptimisticUpdates]
  );

  const clearOptimisticUpdate = useCallback(() => {
    if (enableOptimisticUpdates) {
      setOptimisticData(null);
    }
  }, [enableOptimisticUpdates]);

  // Final data priority: optimistic > fresh > cached
  const finalData = optimisticData || convexData || localCache;

  return {
    data: finalData,
    isLoading: convexData === undefined,
    refetch: () => {
      const key = normalizeQueryKey(queryKey);
      queryClient.invalidateQueries({ queryKey: key });
    },
    setOptimisticUpdate,
    clearOptimisticUpdate,
    isOptimistic: Boolean(optimisticData),
  };
}

/**
 * Enhanced mutation hook with React Query optimistic updates
 */
interface ConvexMutationOptions<TData, TVariables> {
  queryKey?: string | string[];
  optimisticUpdate?: (variables: TVariables, currentData: TData) => TData;
  onSuccess?: (data: unknown, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  invalidateQueries?: string[];
  dispatchEvents?: string[];
}

export function useConvexMutationWithCache<
  TData = unknown,
  TVariables = unknown,
>(
  convexMutation: FunctionReference<"mutation">,
  options: ConvexMutationOptions<TData, TVariables> = {}
) {
  const {
    queryKey,
    optimisticUpdate,
    onSuccess,
    onError,
    invalidateQueries = [],
    dispatchEvents = [],
  } = options;

  const queryClient = useQueryClient();
  const convexMutationFn = useConvexMutation(convexMutation);

  const mutation = useMutation({
    mutationFn: async (variables: TVariables) => {
      return await convexMutationFn(variables as Record<string, unknown>);
    },

    onMutate: async (variables: TVariables) => {
      if (!queryKey || !optimisticUpdate) return;

      const key = normalizeQueryKey(queryKey);
      await queryClient.cancelQueries({ queryKey: key });

      const previousData = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (currentData: TData) => {
        if (!currentData) return currentData;
        return optimisticUpdate(variables, currentData);
      });

      return { previousData };
    },

    onError: (error: Error, variables: TVariables, context) => {
      if (context?.previousData && queryKey) {
        const key = normalizeQueryKey(queryKey);
        queryClient.setQueryData(key, context.previousData);
      }
      onError?.(error, variables);
    },

    onSuccess: (data, variables) => {
      invalidateQueries.forEach(keyToInvalidate => {
        const key = normalizeQueryKey(keyToInvalidate);
        queryClient.invalidateQueries({ queryKey: key });
      });

      if (typeof window !== "undefined") {
        dispatchEvents.forEach(eventName => {
          window.dispatchEvent(new CustomEvent(eventName));
        });
      }

      onSuccess?.(data, variables);
    },

    onSettled: () => {
      if (queryKey) {
        const key = normalizeQueryKey(queryKey);
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}

/**
 * Enhanced action hook with loading states
 */
interface ConvexActionOptions<TResult, TVariables> {
  onSuccess?: (data: TResult, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  invalidateQueries?: string[];
  dispatchEvents?: string[];
}

export function useConvexActionWithCache<
  TResult = unknown,
  TVariables = unknown,
>(
  convexAction: FunctionReference<"action">,
  options: ConvexActionOptions<TResult, TVariables> = {}
) {
  const {
    onSuccess,
    onError,
    invalidateQueries = [],
    dispatchEvents = [],
  } = options;

  const queryClient = useQueryClient();
  const convexActionFn = useConvexAction(convexAction);

  const mutation = useMutation({
    mutationFn: async (variables: TVariables) => {
      return await convexActionFn(variables as Record<string, unknown>);
    },

    onSuccess: (data, variables) => {
      invalidateQueries.forEach(keyToInvalidate => {
        const key = normalizeQueryKey(keyToInvalidate);
        queryClient.invalidateQueries({ queryKey: key });
      });

      if (typeof window !== "undefined") {
        dispatchEvents.forEach(eventName => {
          window.dispatchEvent(new CustomEvent(eventName));
        });
      }

      onSuccess?.(data, variables);
    },

    onError: (error: Error, variables: TVariables) => {
      onError?.(error, variables);
    },
  });

  return {
    execute: mutation.mutate,
    executeAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}

/**
 * Utility hook for bulk query invalidation
 */
export function useQueryInvalidation() {
  const queryClient = useQueryClient();

  const invalidateQueries = useCallback(
    (keys: string | string[]) => {
      const queryKeys = Array.isArray(keys) ? keys : [keys];
      queryKeys.forEach(keyToInvalidate => {
        const key = normalizeQueryKey(keyToInvalidate);
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    [queryClient]
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  const clearCache = useCallback(
    (keys?: string | string[]) => {
      if (keys) {
        const queryKeys = Array.isArray(keys) ? keys : [keys];
        queryKeys.forEach(keyToInvalidate => {
          const key = normalizeQueryKey(keyToInvalidate);
          queryClient.removeQueries({ queryKey: key });
        });
      } else {
        queryClient.clear();
      }
    },
    [queryClient]
  );

  return {
    invalidateQueries,
    invalidateAll,
    clearCache,
  };
}

// Aliases for backward compatibility
export const useConvexWithOptimizedCache = useConvexWithCache;
export const useConvexMutationOptimized = useConvexMutationWithCache;
export const useConvexActionOptimized = useConvexActionWithCache;
