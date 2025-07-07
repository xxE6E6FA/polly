import { type PaginatedQueryReference, usePaginatedQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VListHandle } from "virtua";
import { useDebouncedCallback } from "./use-debounce";

interface UseVirtualizedPaginationOptions {
  initialNumItems?: number;
  loadMoreThreshold?: number; // Distance from bottom in pixels
  autoLoadMore?: boolean; // Whether to automatically load more when scrolling
  debounceDelay?: number; // Debounce delay for load more calls
}

export function useVirtualizedPagination(
  query: PaginatedQueryReference,
  args: Record<string, unknown> | "skip",
  options: UseVirtualizedPaginationOptions = {}
) {
  const {
    initialNumItems = 20,
    loadMoreThreshold = 200,
    autoLoadMore = true,
    debounceDelay = 100,
  } = options;

  const vlistRef = useRef<VListHandle>(null);

  // Generate a unique ID for this VList instance
  const vlistId = useMemo(
    () => `vlist-${Math.random().toString(36).substr(2, 9)}`,
    []
  );

  const paginatedResult = usePaginatedQuery(query, args, { initialNumItems });

  const isLoading = paginatedResult.status === "LoadingFirstPage";
  const isLoadingMore = paginatedResult.status === "LoadingMore";
  const canLoadMore = paginatedResult.status === "CanLoadMore";

  // Helper function to get the scroll container
  const getScrollContainer = useCallback(() => {
    // Use the unique data attribute to reliably find the scroll container
    const vlistElement = document.querySelector(`[data-vlist-id="${vlistId}"]`);
    return vlistElement as HTMLElement | null;
  }, [vlistId]);

  // Debounced load more function to prevent race conditions
  const debouncedLoadMore = useDebouncedCallback(
    () => {
      if (canLoadMore && !isLoadingMore) {
        paginatedResult.loadMore(initialNumItems);
      }
    },
    debounceDelay,
    { trailing: true }
  );

  // Handle infinite scroll
  const handleScroll = useCallback(() => {
    if (!(autoLoadMore && canLoadMore) || isLoadingMore) {
      return;
    }

    const scrollElement = getScrollContainer();
    if (!scrollElement) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;

    if (scrollTop + clientHeight >= scrollHeight - loadMoreThreshold) {
      debouncedLoadMore();
    }
  }, [
    autoLoadMore,
    canLoadMore,
    isLoadingMore,
    getScrollContainer,
    loadMoreThreshold,
    debouncedLoadMore,
  ]);

  // Set up scroll listener
  useEffect(() => {
    if (!autoLoadMore) {
      return;
    }

    const scrollElement = getScrollContainer();
    if (!scrollElement) {
      return;
    }

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, autoLoadMore, getScrollContainer]);

  return {
    ...paginatedResult,
    vlistRef,
    vlistId,
    isLoading,
    isLoadingMore,
    canLoadMore,
    // Manual load more function
    loadMore: () => paginatedResult.loadMore(initialNumItems),
  };
}
