import type React from "react";
import { memo, useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";

export interface VirtualizedContainerProps<TItem> {
  /** Items to render */
  items: TItem[];
  /** Get unique key for each item */
  getItemKey: (item: TItem) => string;
  /** Render function for each item */
  renderItem: (item: TItem, index: number) => React.ReactNode;
  /** Whether to use container-based scroll (vs window scroll) */
  useContainerScroll: boolean;
  /** Scroll container ref for container-based virtualization */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Start margin offset for virtualization (rendered as header spacer) */
  startMargin?: number;
  /** Number of items to render outside visible area */
  overscan?: number;
  /** Content to render while loading more */
  loadingMoreContent?: React.ReactNode;
  /** Whether currently loading more items */
  isLoadingMore?: boolean;
}

// Context type for virtuoso components
interface VirtuosoContext {
  startMargin: number;
  isLoadingMore: boolean;
  loadingMoreContent: React.ReactNode;
}

// Header component for start margin spacing
const ListHeader = memo(({ context }: { context?: VirtuosoContext }) =>
  context?.startMargin ? <div style={{ height: context.startMargin }} /> : null
);
ListHeader.displayName = "ListHeader";

// Footer component for loading indicator
const ListFooter = memo(({ context }: { context?: VirtuosoContext }) =>
  context?.isLoadingMore ? context.loadingMoreContent : null
);
ListFooter.displayName = "ListFooter";

// Static components object
const virtuosoComponents = {
  Header: ListHeader,
  Footer: ListFooter,
};

/**
 * Layout-agnostic virtualization container.
 * Handles window vs container scroll detection and renders items via virtualization.
 * Layout (list, grid, etc.) is controlled by the renderItem function.
 *
 * @example
 * ```tsx
 * <VirtualizedContainer
 *   items={files}
 *   getItemKey={(file) => file.id}
 *   renderItem={(file) => <FileCard file={file} />}
 *   useContainerScroll={false}
 * />
 * ```
 */
export function VirtualizedContainer<TItem>({
  items,
  getItemKey,
  renderItem,
  useContainerScroll,
  scrollContainerRef,
  startMargin = 0,
  overscan = 4,
  loadingMoreContent,
  isLoadingMore = false,
}: VirtualizedContainerProps<TItem>) {
  // Compute key for each item
  const computeItemKey = useCallback(
    (index: number, item: TItem) => getItemKey(item),
    [getItemKey]
  );

  // Render each item
  const itemContent = useCallback(
    (index: number, item: TItem) => renderItem(item, index),
    [renderItem]
  );

  // Context for virtuoso components
  const virtuosoContext = useMemo<VirtuosoContext>(
    () => ({
      startMargin,
      isLoadingMore,
      loadingMoreContent,
    }),
    [startMargin, isLoadingMore, loadingMoreContent]
  );

  return (
    <Virtuoso
      data={items}
      computeItemKey={computeItemKey}
      itemContent={itemContent}
      context={virtuosoContext}
      components={virtuosoComponents}
      overscan={overscan * 50}
      useWindowScroll={!useContainerScroll}
      customScrollParent={
        useContainerScroll
          ? (scrollContainerRef?.current ?? undefined)
          : undefined
      }
    />
  );
}
