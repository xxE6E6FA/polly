import { VList } from "virtua";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useVirtualizedPagination } from "@/hooks/use-virtualized-pagination";
import { type PaginatedQueryReference } from "convex/react";

interface VirtualizedPaginatedListProps<T> {
  query: PaginatedQueryReference;
  queryArgs: Record<string, unknown> | "skip";
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey?: (item: T, index: number) => string;
  emptyState?: React.ReactNode;
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
  className = "min-h-0 flex-1",
  itemHeight = 100,
  initialNumItems = 20,
}: VirtualizedPaginatedListProps<T>) {
  const { results, vlistRef, vlistId, isLoading, isLoadingMore } =
    useVirtualizedPagination(query, queryArgs, {
      initialNumItems,
      autoLoadMore: true,
    });

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowsClockwise className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (results.length === 0 && emptyState) {
    return <>{emptyState}</>;
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
        data-vlist-id={vlistId}
      >
        {results.map((item: T, index: number) => {
          const key = getItemKey ? getItemKey(item, index) : `item-${index}`;
          return (
            <div key={key} style={{ minHeight: itemHeight }}>
              {renderItem(item, index)}
            </div>
          );
        })}

        {/* Loading indicator at the bottom */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowsClockwise className="h-4 w-4 animate-spin" />
              Loading more...
            </div>
          </div>
        )}
      </VList>
    </div>
  );
}
