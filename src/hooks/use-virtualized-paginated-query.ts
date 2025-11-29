import { usePaginatedQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useScrollContainer } from "@/providers/scroll-container-context";

export interface UseVirtualizedPaginatedQueryOptions {
  /** Convex paginated query reference */
  // biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference requires flexible typing for paginated queries
  query: FunctionReference<"query", any, any, any>;
  /** Query arguments or "skip" to disable the query */
  queryArgs: Record<string, unknown> | "skip";
  /** Number of items to fetch initially */
  initialNumItems?: number;
  /** Number of items to fetch when loading more */
  loadMoreCount?: number;
  /** Distance from bottom (in px) to trigger load more */
  loadMoreThreshold?: number;
  /** Optional scroll container ref for non-window scroll contexts */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Offset from the top of the scroll container to account for content above the virtualizer.
   * When not provided, the component auto-measures its offset from the scroll container.
   */
  startMargin?: number;
}

export interface UseVirtualizedPaginatedQueryResult<TItem> {
  /** Query results */
  results: TItem[];
  /** Current pagination status */
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more items */
  isLoadingMore: boolean;
  /** Whether more items can be loaded */
  canLoadMore: boolean;
  /** Whether using container-based scroll (vs window scroll) */
  useContainerScroll: boolean;
  /** Effective scroll container ref (from prop or context) */
  effectiveScrollContainerRef: React.RefObject<HTMLElement | null> | undefined;
  /** Measured or provided start margin for virtualization */
  startMargin: number;
  /** Ref to attach to the list container for auto-measuring startMargin */
  listContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook that handles paginated query fetching with infinite scroll loading.
 * Supports both window scroll and container scroll contexts.
 *
 * @example
 * ```tsx
 * const { results, isLoading, listContainerRef } = useVirtualizedPaginatedQuery({
 *   query: api.items.list,
 *   queryArgs: { filter: "active" },
 * });
 * ```
 */
export function useVirtualizedPaginatedQuery<TItem>({
  query,
  queryArgs,
  initialNumItems = 20,
  loadMoreCount = 20,
  loadMoreThreshold = 400,
  scrollContainerRef,
  startMargin: startMarginProp,
}: UseVirtualizedPaginatedQueryOptions): UseVirtualizedPaginatedQueryResult<TItem> {
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [measuredStartMargin, setMeasuredStartMargin] = useState(0);

  // Use explicit scrollContainerRef prop or fall back to context
  const scrollContainerContext = useScrollContainer();

  // Determine if we should use container-based virtualization
  const useContainerScroll =
    !!scrollContainerRef ||
    !!scrollContainerContext?.isInScrollContainerContext;

  // Get the effective scroll ref for the Virtualizer
  const effectiveScrollContainerRef =
    scrollContainerRef ?? scrollContainerContext?.ref;

  // Auto-measure startMargin for container-based scroll when not explicitly provided
  useLayoutEffect(() => {
    if (startMarginProp !== undefined || !useContainerScroll) {
      return;
    }

    const listContainer = listContainerRef.current;
    if (!listContainer) {
      return;
    }

    const measureOffset = () => {
      const scrollContainer = effectiveScrollContainerRef?.current;
      if (!scrollContainer) {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const listRect = listContainer.getBoundingClientRect();
      const offset =
        listRect.top - containerRect.top + scrollContainer.scrollTop;
      setMeasuredStartMargin(Math.max(0, Math.round(offset)));
    };

    measureOffset();

    const resizeObserver = new ResizeObserver(() => {
      measureOffset();
    });

    resizeObserver.observe(listContainer);

    const scrollContainer = effectiveScrollContainerRef?.current;
    if (scrollContainer) {
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [startMarginProp, useContainerScroll, effectiveScrollContainerRef]);

  const startMargin = startMarginProp ?? measuredStartMargin;

  // biome-ignore lint/suspicious/noExplicitAny: Required to bypass Convex's strict PaginatedQueryReference type
  const paginatedResult = usePaginatedQuery(query as any, queryArgs, {
    initialNumItems,
  });

  const results = paginatedResult.results as TItem[];
  const status = paginatedResult.status;
  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  // Use refs for values needed in scroll handler to avoid effect re-runs
  const canLoadMoreRef = useRef(canLoadMore);
  const loadMoreRef = useRef(paginatedResult.loadMore);

  canLoadMoreRef.current = canLoadMore;
  loadMoreRef.current = paginatedResult.loadMore;

  // Handle scroll to detect when near bottom
  useEffect(() => {
    const scrollContainer = effectiveScrollContainerRef?.current;

    const handleScroll = () => {
      if (!canLoadMoreRef.current) {
        return;
      }

      if (throttleTimerRef.current) {
        return;
      }

      let distanceFromBottom: number;

      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      } else {
        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        distanceFromBottom = documentHeight - scrollTop - windowHeight;
      }

      if (distanceFromBottom < loadMoreThreshold) {
        loadMoreRef.current(loadMoreCount);

        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
        }, 300);
      }
    };

    const target = scrollContainer ?? window;
    target.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, [loadMoreThreshold, loadMoreCount, effectiveScrollContainerRef]);

  // Cleanup throttle timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  return {
    results,
    status,
    isLoading,
    isLoadingMore,
    canLoadMore,
    useContainerScroll,
    effectiveScrollContainerRef,
    startMargin,
    listContainerRef,
  };
}
