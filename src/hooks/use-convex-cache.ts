import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";

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
  onCacheInvalidation?: () => void;
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
    onCacheInvalidation,
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

  const handleCacheInvalidation = useCallback(() => {
    const key = normalizeQueryKey(queryKey);
    queryClient.invalidateQueries({ queryKey: key });

    if (clearCachedData) {
      clearCachedData();
      setLocalCache(null);
    }

    if (enableOptimisticUpdates) {
      setOptimisticData(null);
    }

    onCacheInvalidation?.();
  }, [
    queryKey,
    queryClient,
    clearCachedData,
    enableOptimisticUpdates,
    onCacheInvalidation,
  ]);

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

    const eventHandlers = invalidationEvents.map(eventName => {
      const handler = () => handleCacheInvalidation();
      window.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      eventHandlers.forEach(({ eventName, handler }) => {
        window.removeEventListener(eventName, handler);
      });
    };
  }, [invalidationEvents, handleCacheInvalidation]);

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
    freshData: convexData,
    cachedData: localCache,
    isLoading: convexData === undefined,
    refetch: () => {
      const key = normalizeQueryKey(queryKey);
      queryClient.invalidateQueries({ queryKey: key });
    },
    setOptimisticUpdate,
    clearOptimisticUpdate,
    isOptimistic: Boolean(optimisticData),
    invalidateCache: handleCacheInvalidation,
  };
}

/**
 * Enhanced mutation hook with React Query optimistic updates
 */
interface MutationOptions<TArgs, TResult> {
  onSuccess?: (result: TResult, args: TArgs) => void;
  onError?: (error: Error, args: TArgs) => void;
  invalidationEvents?: string[];
  invalidateQueries?: string[];
}

export function useConvexMutationWithCache<
  TArgs = Record<string, unknown>,
  TResult = unknown,
>(
  convexMutation: FunctionReference<"mutation">,
  options: MutationOptions<TArgs, TResult> = {}
) {
  const {
    onSuccess,
    onError,
    invalidationEvents = [],
    invalidateQueries = [],
  } = options;

  const queryClient = useQueryClient();
  const convexMutationFn = useConvexMutation(convexMutation);

  const mutation = useMutation({
    mutationFn: async (variables: TArgs) => {
      return await convexMutationFn(variables as Record<string, unknown>);
    },

    onSuccess: (data, variables) => {
      invalidateQueries.forEach(keyToInvalidate => {
        const key = normalizeQueryKey(keyToInvalidate);
        queryClient.invalidateQueries({ queryKey: key });
      });

      if (typeof window !== "undefined") {
        invalidationEvents.forEach(eventName => {
          window.dispatchEvent(new CustomEvent(eventName));
        });
      }

      onSuccess?.(data, variables);
    },

    onError: onError
      ? (error: Error, variables: TArgs) => {
          onError(error, variables);
        }
      : undefined,
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
interface ActionOptions<TResult, TVariables> {
  onSuccess?: (data: TResult, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  invalidateQueries?: string[];
  invalidationEvents?: string[];
}

export function useConvexActionWithCache<
  TResult = unknown,
  TVariables = unknown,
>(
  convexAction: FunctionReference<"action">,
  options: ActionOptions<TResult, TVariables> = {}
) {
  const {
    onSuccess,
    onError,
    invalidateQueries = [],
    invalidationEvents = [],
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
        invalidationEvents.forEach(eventName => {
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

export function useLoadingState() {
  const [isLoading, setIsLoading] = useState(false);
  const operationCount = useRef(0);

  const withLoadingState = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      operationCount.current++;
      setIsLoading(true);

      try {
        return await operation();
      } finally {
        operationCount.current--;
        if (operationCount.current === 0) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  return {
    isLoading,
    withLoadingState,
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

export function useEventDispatcher() {
  const dispatch = useCallback((eventName: string, detail?: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }, []);

  const subscribe = useCallback(
    (eventName: string, handler: (event: CustomEvent) => void) => {
      if (typeof window === "undefined") {
        return () => {
          // No-op for server-side rendering
        };
      }

      window.addEventListener(eventName, handler as EventListener);
      return () => {
        window.removeEventListener(eventName, handler as EventListener);
      };
    },
    []
  );

  return {
    dispatch,
    subscribe,
  };
}
