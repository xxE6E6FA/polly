import { useCallback, useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { type FunctionReference } from "convex/server";

/**
 * A comprehensive hook that DRYs up common Convex patterns:
 * - Query with local storage caching for instant rendering
 * - Event-based cache invalidation
 * - Optimistic updates integration
 * - Loading state management
 */

interface ConvexCacheOptions<TData> {
  // Cache getter/setter functions
  getCachedData: () => TData | null;
  setCachedData: (data: TData) => void;
  clearCachedData: () => void;

  // Events that should trigger cache invalidation
  invalidationEvents?: string[];

  // Custom cache invalidation handler
  onCacheInvalidation?: () => void;
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
    getCachedData,
    setCachedData,
    clearCachedData,
    invalidationEvents = [],
    onCacheInvalidation,
  } = options;

  // Initialize with cached data for instant rendering
  const [cachedData, setCachedDataState] = useState<TData | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return getCachedData();
  });

  // Query fresh data from Convex
  const freshData = useQuery(convexQuery, args);

  // Update cache when fresh data arrives
  useEffect(() => {
    if (freshData !== undefined) {
      setCachedData(freshData);
      setCachedDataState(freshData);
    }
  }, [freshData, setCachedData]);

  // Handle cache invalidation
  const handleCacheInvalidation = useCallback(() => {
    clearCachedData();
    setCachedDataState(null);
    onCacheInvalidation?.();
  }, [clearCachedData, onCacheInvalidation]);

  // Set up event listeners for cache invalidation
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

  return {
    data: freshData ?? cachedData,
    freshData,
    cachedData,
    isLoading: freshData === undefined,
    invalidateCache: handleCacheInvalidation,
  };
}

/**
 * Hook for managing mutations with consistent error handling and success callbacks
 */
interface MutationOptions<TArgs, TResult> {
  onSuccess?: (result: TResult, args: TArgs) => void;
  onError?: (error: Error, args: TArgs) => void;
  invalidationEvents?: string[];
}

export function useConvexMutation<
  TArgs = Record<string, unknown>,
  TResult = unknown,
>(
  convexMutation: FunctionReference<"mutation">,
  options: MutationOptions<TArgs, TResult> = {}
) {
  const { onSuccess, onError, invalidationEvents = [] } = options;
  const mutation = useMutation(convexMutation);

  const mutateWithOptions = useCallback(
    async (args: TArgs) => {
      try {
        const result = await mutation(args as Record<string, unknown>);

        // Dispatch invalidation events
        if (typeof window !== "undefined") {
          invalidationEvents.forEach(eventName => {
            window.dispatchEvent(new CustomEvent(eventName));
          });
        }

        onSuccess?.(result, args);
        return result;
      } catch (error) {
        onError?.(error as Error, args);
        throw error;
      }
    },
    [mutation, onSuccess, onError, invalidationEvents]
  );

  return {
    mutate: mutateWithOptions,
    isLoading: false, // Convex mutations don't have loading state in the hook
  };
}

/**
 * Hook for managing actions with consistent error handling and loading states
 */
interface ActionOptions<TArgs, TResult> {
  onSuccess?: (result: TResult, args: TArgs) => void;
  onError?: (error: Error, args: TArgs) => void;
  invalidationEvents?: string[];
}

export function useConvexAction<
  TArgs = Record<string, unknown>,
  TResult = unknown,
>(
  convexAction: FunctionReference<"action">,
  options: ActionOptions<TArgs, TResult> = {}
) {
  const { onSuccess, onError, invalidationEvents = [] } = options;
  const action = useAction(convexAction);
  const [isLoading, setIsLoading] = useState(false);

  const executeWithOptions = useCallback(
    async (args: TArgs) => {
      setIsLoading(true);
      try {
        const result = await action(args as Record<string, unknown>);

        // Dispatch invalidation events
        if (typeof window !== "undefined") {
          invalidationEvents.forEach(eventName => {
            window.dispatchEvent(new CustomEvent(eventName));
          });
        }

        onSuccess?.(result, args);
        return result;
      } catch (error) {
        onError?.(error as Error, args);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [action, onSuccess, onError, invalidationEvents]
  );

  return {
    execute: executeWithOptions,
    isLoading,
  };
}

/**
 * Utility hook for managing loading states across multiple operations
 */
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
 * Hook for managing event-based communication between components
 */
export function useEventDispatcher() {
  const dispatch = useCallback((eventName: string, detail?: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }, []);

  const subscribe = useCallback(
    (eventName: string, handler: (event: CustomEvent) => void) => {
      if (typeof window === "undefined") {
        return () => {};
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
