import type { PaginatedQueryReference } from "convex/react";
import { VList } from "virtua";
import { Spinner } from "@/components/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useVirtualizedPagination } from "@/hooks/use-virtualized-pagination";

interface VirtualizedPaginatedListProps<T> {
  query: PaginatedQueryReference;
  queryArgs: Record<string, unknown> | "skip";
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey?: (item: T, index: number) => string;
  emptyState?: React.ReactNode;
  zeroState?: React.ReactNode;
  loadingSkeleton?: React.ReactNode;
  className?: string;
  itemHeight?: number;
  initialNumItems?: number;
}

export function VirtualizedPaginatedList<T>({
  query,
  queryArgs,
  renderItem,
  getItemKey,
  emptyState,
  zeroState,
  loadingSkeleton,
  className = "min-h-0 flex-1",
  itemHeight = 100,
  initialNumItems = 20,
}: VirtualizedPaginatedListProps<T>) {
  const { results, vlistRef, sentinelRef, isLoading, isLoadingMore } =
    useVirtualizedPagination(query, queryArgs, {
      initialNumItems,
      autoLoadMore: true,
    });

  if (isLoading) {
    if (loadingSkeleton) {
      return <>{loadingSkeleton}</>;
    }
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Loading...
        </div>
      </div>
    );
  }

  if (results.length === 0 && (zeroState || emptyState)) {
    return <>{zeroState || emptyState}</>;
  }

  if (results.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">No items found</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <VList
        ref={vlistRef}
        style={{
          height: "100%",
          width: "100%",
          overflow: "auto",
        }}
        className="overscroll-contain"
      >
        {results.map((item: T, index: number) => {
          const key = getItemKey ? getItemKey(item, index) : `item-${index}`;
          return (
            <div key={key} style={{ minHeight: itemHeight }}>
              {renderItem(item, index)}
            </div>
          );
        })}

        {/* IntersectionObserver sentinel for infinite scroll */}
        {sentinelRef && (
          <div
            ref={sentinelRef}
            style={{
              height: 1,
              width: "100%",
              pointerEvents: "none",
            }}
            aria-hidden
          />
        )}

        {/* Loading indicator at the bottom */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Loading more...
            </div>
          </div>
        )}
      </VList>
    </div>
  );
}
