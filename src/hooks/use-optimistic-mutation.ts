import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMutation as useConvexMutation } from "convex/react";
import { type FunctionReference } from "convex/server";

interface OptimisticMutationOptions<TData, TVariables, TContext = unknown> {
  // The Convex mutation to call
  convexMutation: FunctionReference<"mutation">;

  // Query key(s) to update optimistically
  queryKey: string | string[];

  // Function to optimistically update the cached data
  optimisticUpdate: (variables: TVariables, currentData: TData) => TData;

  // Optional: Custom error handling
  onError?: (
    error: Error,
    variables: TVariables,
    context: TContext | undefined
  ) => void;

  // Optional: Success callback
  onSuccess?: (
    data: unknown,
    variables: TVariables,
    context: TContext | undefined
  ) => void;

  // Optional: Function to invalidate additional queries on success
  invalidateQueries?: string[] | (() => void);

  // Optional: Custom context for rollback
  getContext?: (variables: TVariables) => TContext;
}

// Helper function to normalize query keys
function normalizeQueryKey(queryKey: string | string[]): string[] {
  return Array.isArray(queryKey) ? queryKey : [queryKey];
}

export function useOptimisticMutation<
  TData = unknown,
  TVariables = unknown,
  TContext = unknown,
>({
  convexMutation,
  queryKey,
  optimisticUpdate,
  onError,
  onSuccess,
  invalidateQueries,
  getContext,
}: OptimisticMutationOptions<TData, TVariables, TContext>) {
  const queryClient = useQueryClient();
  const convexMutationFn = useConvexMutation(convexMutation);

  const mutation = useMutation({
    mutationFn: async (variables: TVariables) => {
      return await convexMutationFn(variables as Record<string, unknown>);
    },

    // Optimistic update
    onMutate: async (variables: TVariables) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      const queryKeys = Array.isArray(queryKey) ? queryKey : [queryKey];

      await Promise.all(
        queryKeys.map(key => {
          const normalizedKey = normalizeQueryKey(key);
          return queryClient.cancelQueries({ queryKey: normalizedKey });
        })
      );

      // Snapshot the previous values for rollback
      const previousData: Record<string, unknown> = {};

      queryKeys.forEach(key => {
        const normalizedKey = normalizeQueryKey(key);
        previousData[key] = queryClient.getQueryData(normalizedKey);

        // Optimistically update the cache
        queryClient.setQueryData(normalizedKey, (currentData: TData) => {
          if (!currentData) return currentData;
          return optimisticUpdate(variables, currentData);
        });
      });

      // Return context with previous data for potential rollback
      const context = getContext ? getContext(variables) : undefined;

      return { previousData, context } as {
        previousData: Record<string, unknown>;
        context: TContext;
      };
    },

    // On error, rollback to previous state
    onError: (error: Error, variables: TVariables, context) => {
      if (context?.previousData) {
        const queryKeys = Array.isArray(queryKey) ? queryKey : [queryKey];

        queryKeys.forEach(key => {
          if (context.previousData[key] !== undefined) {
            const normalizedKey = normalizeQueryKey(key);
            queryClient.setQueryData(normalizedKey, context.previousData[key]);
          }
        });
      }

      // Call custom error handler
      onError?.(error, variables, context?.context);
    },

    // On success, invalidate queries to ensure fresh data
    onSuccess: (data, variables, context) => {
      // Invalidate specified queries
      if (invalidateQueries) {
        if (typeof invalidateQueries === "function") {
          invalidateQueries();
        } else {
          invalidateQueries.forEach(keyToInvalidate => {
            const key = normalizeQueryKey(keyToInvalidate);
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      }

      // Call custom success handler
      onSuccess?.(data, variables, context?.context);
    },

    // Always refetch after mutation settles to ensure consistency
    onSettled: () => {
      const queryKeys = Array.isArray(queryKey) ? queryKey : [queryKey];
      queryKeys.forEach(key => {
        const normalizedKey = normalizeQueryKey(key);
        queryClient.invalidateQueries({ queryKey: normalizedKey });
      });
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

// Convenience hook for simple boolean toggles
export function useOptimisticToggle<TItem extends Record<string, unknown>>({
  convexMutation,
  queryKey,
  itemId,
  toggleProperty,
  onError,
  onSuccess,
  invalidateQueries,
}: {
  convexMutation: FunctionReference<"mutation">;
  queryKey: string | string[];
  itemId: string | number;
  toggleProperty: keyof TItem;
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  invalidateQueries?: string[];
}) {
  return useOptimisticMutation<TItem[], Record<string, unknown>>({
    convexMutation,
    queryKey,
    optimisticUpdate: (_variables, currentData) => {
      if (!Array.isArray(currentData)) return currentData;

      return currentData.map(item => {
        if (item._id === itemId || item.id === itemId) {
          return {
            ...item,
            [toggleProperty]: !item[toggleProperty],
          };
        }
        return item;
      });
    },
    onError: onError ? error => onError(error) : undefined,
    onSuccess: onSuccess ? data => onSuccess(data) : undefined,
    invalidateQueries,
  });
}

// Convenience hook for updating a single item in a list
export function useOptimisticUpdate<TItem extends Record<string, unknown>>({
  convexMutation,
  queryKey,
  itemId,
  onError,
  onSuccess,
  invalidateQueries,
}: {
  convexMutation: FunctionReference<"mutation">;
  queryKey: string | string[];
  itemId: string | number;
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  invalidateQueries?: string[];
}) {
  return useOptimisticMutation<TItem[], Record<string, unknown>>({
    convexMutation,
    queryKey,
    optimisticUpdate: (variables, currentData) => {
      if (!Array.isArray(currentData)) return currentData;

      return currentData.map(item => {
        if (item._id === itemId || item.id === itemId) {
          return {
            ...item,
            ...variables,
          };
        }
        return item;
      });
    },
    onError: onError ? error => onError(error) : undefined,
    onSuccess: onSuccess ? data => onSuccess(data) : undefined,
    invalidateQueries,
  });
}
