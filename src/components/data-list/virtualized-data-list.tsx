import type { FunctionReference } from "convex/server";
import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortDirection } from "@/hooks/use-list-sort";
import { useVirtualizedPaginatedQuery } from "@/hooks/use-virtualized-paginated-query";
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
import { VirtualizedContainer } from "./virtualized-container";

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
  /**
   * Offset from the top for sticky header positioning.
   * @default 68 (matches the settings nav header height)
   */
  headerOffset?: number;
  /**
   * Offset from the top of the scroll container to account for content above the virtualizer.
   * This tells the virtualizer that content exists before it in the scroll container.
   * When not provided, the component auto-measures its offset from the scroll container.
   * Pass an explicit value to override auto-detection.
   */
  startMargin?: number;

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
  headerOffset = 68,
  startMargin: startMarginProp,
  loadingState,
  emptyState,
  className,
  scrollContainerRef,
}: VirtualizedDataListProps<TItem, TField>) {
  // Use the base hook for pagination and scroll handling
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

    // Render item for virtualization
    const renderItem = (item: TItem) => {
      const key = getItemKey(item);
      const isSelected = selection?.isSelected(item) ?? false;

      return (
        <ListRow
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
    };

    // Results with virtualization
    return (
      <VirtualizedContainer
        items={results}
        getItemKey={getItemKey}
        renderItem={renderItem}
        useContainerScroll={useContainerScroll}
        scrollContainerRef={effectiveScrollContainerRef}
        startMargin={startMargin}
        overscan={overscan}
        isLoadingMore={isLoadingMore}
        loadingMoreContent={renderSkeletonRows(3)}
      />
    );
  };

  return (
    <ListContainer ref={listContainerRef} className={className}>
      {/* Desktop Table Header - always visible */}
      <ListHeader
        className="hidden lg:block"
        gridTemplate={gridTemplate}
        stickyTop={headerOffset}
      >
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
