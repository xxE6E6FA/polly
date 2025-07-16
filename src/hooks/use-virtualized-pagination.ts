import { type PaginatedQueryReference, usePaginatedQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VListHandle } from "virtua";

interface UseVirtualizedPaginationOptions {
  initialNumItems?: number;
  loadMoreThreshold?: number; // Distance from bottom in pixels when using scroll method
  autoLoadMore?: boolean; // Whether to automatically load more when scrolling
  throttleDelay?: number; // Throttle delay for load more calls
  useIntersectionObserver?: boolean; // Use IntersectionObserver instead of scroll events
}

export function useVirtualizedPagination<TArgs extends Record<string, unknown>>(
  query: PaginatedQueryReference,
  args: TArgs | "skip",
  options: UseVirtualizedPaginationOptions = {}
) {
  const {
    initialNumItems = 20,
    loadMoreThreshold = 200,
    autoLoadMore = true,
    throttleDelay = 200,
    useIntersectionObserver = true,
  } = options;

  const vlistRef = useRef<VListHandle>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingMoreRef = useRef(false);

  // Track container element for cleanup
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null
  );

  const paginatedResult = usePaginatedQuery(query, args, { initialNumItems });

  const isLoading = paginatedResult.status === "LoadingFirstPage";
  const isLoadingMore = paginatedResult.status === "LoadingMore";
  const canLoadMore = paginatedResult.status === "CanLoadMore";
  const hasNextPage = canLoadMore; // Alias for better ergonomics

  // Update loading ref when status changes
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Get scroll container from virtua ref
  const getScrollContainer = useCallback(() => {
    if (!vlistRef.current) {
      return null;
    }

    // For virtua, the scroll container is the VList element itself
    // We need to find the actual DOM element that virtua creates
    const ref = vlistRef.current as unknown as {
      _container?: HTMLElement;
      scrollElement?: HTMLElement;
    };
    const vlistElement = ref?._container || ref?.scrollElement || null;

    return vlistElement as HTMLElement | null;
  }, []);

  // Throttled load more function to prevent excessive calls
  const throttledLoadMore = useCallback(
    (count = initialNumItems) => {
      if (throttleTimerRef.current) {
        return;
      }

      if (canLoadMore && !isLoadingMoreRef.current) {
        paginatedResult.loadMore(count);

        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
        }, throttleDelay);
      }
    },
    [canLoadMore, paginatedResult, initialNumItems, throttleDelay]
  );

  // Handle infinite scroll with scroll events (fallback)
  const handleScroll = useCallback(() => {
    if (!(autoLoadMore && canLoadMore) || isLoadingMoreRef.current) {
      return;
    }

    const scrollElement = scrollContainer;
    if (!scrollElement) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;

    if (scrollTop + clientHeight >= scrollHeight - loadMoreThreshold) {
      throttledLoadMore();
    }
  }, [
    autoLoadMore,
    canLoadMore,
    scrollContainer,
    loadMoreThreshold,
    throttledLoadMore,
  ]);

  // Set up IntersectionObserver for more efficient infinite scroll
  useEffect(() => {
    if (!(autoLoadMore && useIntersectionObserver && sentinelRef.current)) {
      return;
    }

    const sentinel = sentinelRef.current;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (entry?.isIntersecting && canLoadMore && !isLoadingMoreRef.current) {
          throttledLoadMore();
        }
      },
      {
        // Use the scroll container as root if available, otherwise viewport
        root: scrollContainer,
        rootMargin: `${loadMoreThreshold}px`,
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    autoLoadMore,
    useIntersectionObserver,
    canLoadMore,
    scrollContainer,
    loadMoreThreshold,
    throttledLoadMore,
  ]);

  // Set up scroll listener as fallback when IntersectionObserver is disabled
  useEffect(() => {
    if (!autoLoadMore || useIntersectionObserver || !scrollContainer) {
      return;
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, autoLoadMore, useIntersectionObserver, scrollContainer]);

  // Update scroll container when VList mounts/unmounts
  useEffect(() => {
    const updateContainer = () => {
      const container = getScrollContainer();
      setScrollContainer(container);
    };

    // Try to get container immediately
    updateContainer();

    // Also try after a short delay in case virtua hasn't fully initialized
    const timeoutId = setTimeout(updateContainer, 100);

    return () => {
      clearTimeout(timeoutId);
      setScrollContainer(null);
    };
  }, [getScrollContainer]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const shouldUseSentinel = autoLoadMore && useIntersectionObserver;

  return {
    ...paginatedResult,
    vlistRef,
    sentinelRef: shouldUseSentinel ? sentinelRef : null,
    isLoading,
    isLoadingMore,
    canLoadMore,
    hasNextPage,
    scrollContainer,
    loadMore: throttledLoadMore,
  };
}
