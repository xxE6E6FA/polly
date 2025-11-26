import { usePaginatedQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import type React from "react";
import { useEffect, useRef } from "react";
import {
  Virtualizer,
  type VirtualizerHandle,
  WindowVirtualizer,
  type WindowVirtualizerHandle,
} from "virtua";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { SortDirection } from "@/hooks/use-list-sort";
import { useScrollContainer } from "@/providers/scroll-container-context";
import type { MobileDrawerConfig } from "./data-list-mobile-drawer";
import { DataListMobileRow } from "./data-list-mobile-row";
import { generateGridTemplate } from "./grid-utils";
import { ListCell } from "./list-cell";
import { ListContainer } from "./list-container";
import { ListHeader } from "./list-header";
import { ListHeaderCell } from "./list-header-cell";
import { ListRow } from "./list-row";
import { SelectAllCheckbox } from "./select-all-checkbox";
import { SelectionCheckbox } from "./selection-checkbox";
import { SortableHeader } from "./sortable-header";

export interface VirtualizedDataListColumn<
  TItem,
  TField extends string = string,
> {
  key: string;
  label: string;
  sortable?: boolean;
  sortField?: TField;
  width?: string;
  className?: string;
  hideOnMobile?: boolean;
  hideLabelOnMobile?: boolean;
  render: (item: TItem) => React.ReactNode;
  mobileRender?: (item: TItem) => React.ReactNode;
}

export interface VirtualizedDataListSelection<TItem> {
  selectedKeys: Set<string>;
  isSelected: (item: TItem) => boolean;
  isAllSelected: (items: TItem[]) => boolean;
  toggleItem: (item: TItem) => void;
  toggleAll: (items: TItem[]) => void;
}

export interface VirtualizedDataListSort<TField extends string> {
  field: TField | null;
  direction: SortDirection;
  onSort: (field: TField) => void;
}

interface VirtualizedDataListProps<TItem, TField extends string = string> {
  // Pagination props - accepts any paginated query reference
  // biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference requires flexible typing for paginated queries
  query: FunctionReference<"query", any, any, any>;
  queryArgs: Record<string, unknown> | "skip";

  // DataList props
  getItemKey: (item: TItem) => string;
  columns: VirtualizedDataListColumn<TItem, TField>[];
  selection?: VirtualizedDataListSelection<TItem>;
  sort?: VirtualizedDataListSort<TField>;
  onRowClick?: (item: TItem) => void;
  sortIcons?: {
    asc: React.ComponentType<{ className?: string }>;
    desc: React.ComponentType<{ className?: string }>;
  };
  mobileTitleRender?: (item: TItem) => React.ReactNode;
  mobileMetadataRender?: (item: TItem) => React.ReactNode;
  mobileDrawerConfig?: MobileDrawerConfig<TItem>;

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

  // Optional scroll container for non-window scroll contexts (e.g., mobile carousels)
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export function VirtualizedDataList<TItem, TField extends string = string>({
  query,
  queryArgs,
  getItemKey,
  columns,
  selection,
  sort,
  onRowClick,
  sortIcons,
  mobileTitleRender,
  mobileMetadataRender,
  mobileDrawerConfig,
  initialNumItems = 20,
  loadMoreCount = 20,
  overscan = 4,
  loadMoreThreshold = 400,
  loadingState,
  emptyState,
  className,
  scrollContainerRef,
}: VirtualizedDataListProps<TItem, TField>) {
  const windowVirtualizerRef = useRef<WindowVirtualizerHandle>(null);
  const containerVirtualizerRef = useRef<VirtualizerHandle>(null);
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use explicit scrollContainerRef prop or fall back to context (for mobile carousel slides)
  const scrollContainerContext = useScrollContainer();

  // Determine if we should use container-based virtualization
  // Check based on prop or context presence, not ref.current value (which may not be set yet)
  const useContainerScroll =
    !!scrollContainerRef || scrollContainerContext?.isInScrollContainerContext;

  // Get the effective scroll ref for the Virtualizer
  const effectiveScrollContainerRef =
    scrollContainerRef ?? scrollContainerContext?.ref;

  // biome-ignore lint/suspicious/noExplicitAny: Required to bypass Convex's strict PaginatedQueryReference type
  const paginatedResult = usePaginatedQuery(query as any, queryArgs, {
    initialNumItems,
  });

  const results = paginatedResult.results as TItem[];
  const isLoading = paginatedResult.status === "LoadingFirstPage";
  const isLoadingMore = paginatedResult.status === "LoadingMore";
  const canLoadMore = paginatedResult.status === "CanLoadMore";

  // Use refs for values needed in scroll handler to avoid effect re-runs
  const canLoadMoreRef = useRef(canLoadMore);
  const loadMoreRef = useRef(paginatedResult.loadMore);

  // Keep refs in sync
  canLoadMoreRef.current = canLoadMore;
  loadMoreRef.current = paginatedResult.loadMore;

  // Handle scroll to detect when near bottom (supports both window and container scroll)
  useEffect(() => {
    const scrollContainer = effectiveScrollContainerRef?.current;

    const handleScroll = () => {
      // Only load more if we can and aren't already loading
      if (!canLoadMoreRef.current) {
        return;
      }

      // Prevent duplicate calls with throttle
      if (throttleTimerRef.current) {
        return;
      }

      let distanceFromBottom: number;

      if (scrollContainer) {
        // Container scroll mode
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      } else {
        // Window scroll mode
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
    // Check immediately in case we're already near the bottom
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

  const hasSelection = !!selection;

  // Generate CSS Grid template from column widths
  const gridTemplate = generateGridTemplate(
    columns.map(col => col.width),
    hasSelection
  );

  // Render skeleton rows for loading states
  const renderSkeletonRows = (count: number) => (
    <div className="divide-y divide-border/50">
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map(key => (
        <div key={key} className="p-4">
          {/* Desktop skeleton */}
          <div
            className="hidden lg:grid lg:items-center lg:gap-4"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {hasSelection && (
              <div className="flex justify-center">
                <Skeleton className="h-4 w-4" />
              </div>
            )}
            {columns.map((col, colIndex) => (
              <div key={col.key}>
                {colIndex === 0 ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
              </div>
            ))}
          </div>
          {/* Mobile skeleton */}
          <div className="lg:hidden space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );

  // Render body content based on state
  const renderBody = () => {
    // Initial loading - show skeletons or custom loading state
    if (isLoading) {
      if (loadingState) {
        return loadingState;
      }
      return renderSkeletonRows(6);
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

    // Render items for virtualization
    const renderItems = () =>
      results.map((item: TItem) => {
        const key = getItemKey(item);
        const isSelected = selection?.isSelected(item) ?? false;

        return (
          <ListRow
            key={key}
            selected={isSelected}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            gridTemplate={gridTemplate}
          >
            {/* Desktop Table Layout */}
            <div className="hidden lg:contents">
              {hasSelection && (
                <SelectionCheckbox
                  checked={isSelected}
                  onToggle={() => selection.toggleItem(item)}
                  label={`Select ${key}`}
                />
              )}
              {columns.map(column => (
                <ListCell key={column.key} className={column.className}>
                  {column.render(item)}
                </ListCell>
              ))}
            </div>

            {/* Mobile Card Layout */}
            <DataListMobileRow
              item={item}
              columns={columns}
              mobileTitleRender={mobileTitleRender}
              mobileMetadataRender={mobileMetadataRender}
              mobileDrawerConfig={mobileDrawerConfig}
              onRowClick={onRowClick}
            />
          </ListRow>
        );
      });

    // Results with virtualization - use container-based or window-based virtualizer
    return (
      <>
        {useContainerScroll ? (
          <Virtualizer
            ref={containerVirtualizerRef}
            overscan={overscan}
            scrollRef={effectiveScrollContainerRef}
          >
            {renderItems()}
          </Virtualizer>
        ) : (
          <WindowVirtualizer ref={windowVirtualizerRef} overscan={overscan}>
            {renderItems()}
          </WindowVirtualizer>
        )}

        {/* Skeleton rows while loading more */}
        {isLoadingMore && renderSkeletonRows(3)}
      </>
    );
  };

  return (
    <ListContainer className={className}>
      {/* Desktop Table Header - always visible */}
      <ListHeader className="hidden lg:block" gridTemplate={gridTemplate}>
        {hasSelection && (
          <SelectAllCheckbox
            checked={
              !isLoading &&
              results.length > 0 &&
              selection.isAllSelected(results)
            }
            onToggle={() =>
              !isLoading && results.length > 0 && selection.toggleAll(results)
            }
            disabled={isLoading || results.length === 0}
          />
        )}
        {columns.map(column => {
          if (column.sortable && sort && column.sortField) {
            return (
              <SortableHeader
                key={column.key}
                field={column.sortField}
                sortField={sort.field}
                sortDirection={sort.direction}
                onSort={sort.onSort}
                className={column.className}
                icons={sortIcons}
              >
                {column.label}
              </SortableHeader>
            );
          }

          return (
            <ListHeaderCell key={column.key} className={column.className}>
              {column.label}
            </ListHeaderCell>
          );
        })}
      </ListHeader>

      {/* Body content */}
      {renderBody()}
    </ListContainer>
  );
}
