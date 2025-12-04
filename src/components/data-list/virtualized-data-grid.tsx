import type { FunctionReference } from "convex/server";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useVirtualizedPaginatedQuery } from "@/hooks/use-virtualized-paginated-query";
import { ListContainer } from "./list-container";
import { VirtualizedContainer } from "./virtualized-container";

export interface VirtualizedDataGridSelection<TItem> {
  selectedKeys: Set<string>;
  isSelected: (item: TItem) => boolean;
  isAllSelected: (items: TItem[]) => boolean;
  toggleItem: (item: TItem) => void;
  toggleAll: (items: TItem[]) => void;
}

export interface ResponsiveColumns {
  /** Default columns (mobile, <640px) */
  default?: number;
  /** sm breakpoint (≥640px) */
  sm?: number;
  /** md breakpoint (≥768px) */
  md?: number;
  /** lg breakpoint (≥1024px) */
  lg?: number;
  /** xl breakpoint (≥1280px) */
  xl?: number;
  /** 2xl breakpoint (≥1536px) */
  "2xl"?: number;
}

interface VirtualizedDataGridProps<TItem> {
  // Pagination props
  // biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference requires flexible typing
  query: FunctionReference<"query", any, any, any>;
  queryArgs: Record<string, unknown> | "skip";

  // Grid props
  getItemKey: (item: TItem) => string;
  /** Render function for grid items (desktop) */
  renderItem: (item: TItem, isSelected: boolean) => React.ReactNode;
  /** Responsive column configuration or static number */
  columns: number | ResponsiveColumns;
  /** Selection state and handlers */
  selection?: VirtualizedDataGridSelection<TItem>;
  /** Click handler for grid items */
  onItemClick?: (item: TItem) => void;

  // Mobile list props
  /** Render function for mobile list items. If not provided, uses renderItem */
  mobileListRender?: (item: TItem, isSelected: boolean) => React.ReactNode;
  /** Breakpoint at which to switch to mobile list (default: "lg") */
  mobileBreakpoint?: "sm" | "md" | "lg" | "xl";

  // Virtualization options
  initialNumItems?: number;
  loadMoreCount?: number;
  overscan?: number;
  loadMoreThreshold?: number;

  // Loading/empty states
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;

  // Container styling
  className?: string;

  // Optional scroll container for non-window scroll contexts
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  startMargin?: number;
}

/**
 * Virtualized grid component with responsive columns and mobile list fallback.
 *
 * @example
 * ```tsx
 * <VirtualizedDataGrid
 *   query={api.files.list}
 *   queryArgs={{ type: "image" }}
 *   columns={{ sm: 2, md: 3, lg: 4, "2xl": 6 }}
 *   renderItem={(file, isSelected) => (
 *     <FileCard file={file} selected={isSelected} />
 *   )}
 *   mobileListRender={(file, isSelected) => (
 *     <MobileFileRow file={file} selected={isSelected} />
 *   )}
 * />
 * ```
 */
export function VirtualizedDataGrid<TItem>({
  query,
  queryArgs,
  getItemKey,
  renderItem,
  columns,
  selection,
  onItemClick,
  mobileListRender,
  mobileBreakpoint = "lg",
  initialNumItems = 20,
  loadMoreCount = 20,
  overscan = 4,
  loadMoreThreshold = 400,
  loadingState,
  emptyState,
  className,
  scrollContainerRef,
  startMargin: startMarginProp,
}: VirtualizedDataGridProps<TItem>) {
  const [columnsPerRow, setColumnsPerRow] = useState(() => {
    if (typeof columns === "number") {
      return columns;
    }
    // Default to mobile column count
    return columns.default ?? columns.sm ?? 2;
  });

  const {
    results,
    isLoading,
    isLoadingMore,
    useContainerScroll,
    effectiveScrollContainerRef,
    startMargin,
    listContainerRef,
  } = useVirtualizedPaginatedQuery<TItem>({
    query,
    queryArgs,
    initialNumItems,
    loadMoreCount,
    loadMoreThreshold,
    scrollContainerRef,
    startMargin: startMarginProp,
  });

  // Calculate columns based on window width
  useEffect(() => {
    if (typeof columns === "number") {
      setColumnsPerRow(columns);
      return;
    }

    const updateColumns = () => {
      const width = window.innerWidth;
      let cols = columns.default ?? 2;

      if (width >= 1536 && columns["2xl"]) {
        cols = columns["2xl"];
      } else if (width >= 1280 && columns.xl) {
        cols = columns.xl;
      } else if (width >= 1024 && columns.lg) {
        cols = columns.lg;
      } else if (width >= 768 && columns.md) {
        cols = columns.md;
      } else if (width >= 640 && columns.sm) {
        cols = columns.sm;
      }

      setColumnsPerRow(cols);
    };

    updateColumns();

    let timeoutId: NodeJS.Timeout;
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateColumns, 150);
    };

    window.addEventListener("resize", debouncedUpdate);
    return () => {
      window.removeEventListener("resize", debouncedUpdate);
      clearTimeout(timeoutId);
    };
  }, [columns]);

  // Group items into rows for grid virtualization
  const rows = useMemo(() => {
    const result: TItem[][] = [];
    for (let i = 0; i < results.length; i += columnsPerRow) {
      result.push(results.slice(i, i + columnsPerRow));
    }
    return result;
  }, [results, columnsPerRow]);

  // Get mobile breakpoint class
  const getMobileBreakpointClass = (): { desktop: string; mobile: string } => {
    switch (mobileBreakpoint) {
      case "sm":
        return { desktop: "hidden sm:block", mobile: "sm:hidden" };
      case "md":
        return { desktop: "hidden md:block", mobile: "md:hidden" };
      case "lg":
        return { desktop: "hidden lg:block", mobile: "lg:hidden" };
      case "xl":
        return { desktop: "hidden xl:block", mobile: "xl:hidden" };
      default:
        return { desktop: "hidden lg:block", mobile: "lg:hidden" };
    }
  };

  const breakpointClasses = getMobileBreakpointClass();
  const hasMobileList = !!mobileListRender;

  // Render skeleton grid for loading state
  const renderSkeletonGrid = (count: number) => (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map(key => (
        <Skeleton key={key} className="aspect-square rounded-lg" />
      ))}
    </div>
  );

  // Render skeleton list for mobile loading state
  const renderSkeletonList = (count: number) => (
    <div className="divide-y divide-border/50">
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map(key => (
        <div key={key} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 stack-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  // Render body content based on state
  const renderBody = () => {
    // Initial loading
    if (isLoading) {
      if (loadingState) {
        return loadingState;
      }
      return (
        <>
          {hasMobileList && (
            <div className={breakpointClasses.mobile}>
              {renderSkeletonList(6)}
            </div>
          )}
          <div className={hasMobileList ? breakpointClasses.desktop : ""}>
            {renderSkeletonGrid(8)}
          </div>
        </>
      );
    }

    // Empty state
    if (results.length === 0) {
      if (emptyState) {
        return emptyState;
      }
      return (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">No items found</p>
        </div>
      );
    }

    // Render grid item
    const renderGridItem = (item: TItem) => {
      const isSelected = selection?.isSelected(item) ?? false;
      const content = renderItem(item, isSelected);

      if (onItemClick) {
        return (
          <button
            type="button"
            onClick={() => onItemClick(item)}
            className="text-left w-full"
          >
            {content}
          </button>
        );
      }

      return content;
    };

    // Render mobile list item
    const renderMobileItem = (item: TItem) => {
      if (!mobileListRender) {
        return null;
      }

      const isSelected = selection?.isSelected(item) ?? false;
      const content = mobileListRender(item, isSelected);

      if (onItemClick) {
        return (
          <button
            type="button"
            onClick={() => onItemClick(item)}
            className="text-left w-full"
          >
            {content}
          </button>
        );
      }

      return content;
    };

    // Render a row of grid items
    const renderGridRow = (rowItems: TItem[]) => (
      <div
        className="grid gap-4 pb-4"
        style={{
          gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
        }}
      >
        {rowItems.map(item => (
          <div key={getItemKey(item)}>{renderGridItem(item)}</div>
        ))}
      </div>
    );

    // Get key for a row (use first item's key)
    const getRowKey = (rowItems: TItem[]) =>
      rowItems[0] ? getItemKey(rowItems[0]) : "empty";

    // Results with virtualization
    return (
      <>
        {/* Mobile List View */}
        {hasMobileList && (
          <div className={breakpointClasses.mobile}>
            <VirtualizedContainer
              items={results}
              getItemKey={getItemKey}
              renderItem={renderMobileItem}
              useContainerScroll={useContainerScroll}
              scrollContainerRef={effectiveScrollContainerRef}
              startMargin={startMargin}
              overscan={overscan}
              isLoadingMore={isLoadingMore}
              loadingMoreContent={renderSkeletonList(3)}
            />
          </div>
        )}

        {/* Desktop Grid View - virtualize rows */}
        <div className={hasMobileList ? breakpointClasses.desktop : ""}>
          <VirtualizedContainer
            items={rows}
            getItemKey={getRowKey}
            renderItem={renderGridRow}
            useContainerScroll={useContainerScroll}
            scrollContainerRef={effectiveScrollContainerRef}
            startMargin={startMargin}
            overscan={overscan}
            isLoadingMore={isLoadingMore}
            loadingMoreContent={renderSkeletonGrid(columnsPerRow)}
          />
        </div>
      </>
    );
  };

  return (
    <ListContainer ref={listContainerRef} className={className}>
      {renderBody()}
    </ListContainer>
  );
}
