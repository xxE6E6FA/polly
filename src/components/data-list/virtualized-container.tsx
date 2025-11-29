import type React from "react";
import { useRef } from "react";
import {
  Virtualizer,
  type VirtualizerHandle,
  WindowVirtualizer,
  type WindowVirtualizerHandle,
} from "virtua";

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
  /** Start margin offset for virtualization */
  startMargin?: number;
  /** Number of items to render outside visible area */
  overscan?: number;
  /** Content to render while loading more */
  loadingMoreContent?: React.ReactNode;
  /** Whether currently loading more items */
  isLoadingMore?: boolean;
}

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
  isLoadingMore,
}: VirtualizedContainerProps<TItem>) {
  const windowVirtualizerRef = useRef<WindowVirtualizerHandle>(null);
  const containerVirtualizerRef = useRef<VirtualizerHandle>(null);

  const renderedItems = items.map((item, index) => (
    <div key={getItemKey(item)}>{renderItem(item, index)}</div>
  ));

  return (
    <>
      {useContainerScroll ? (
        <Virtualizer
          ref={containerVirtualizerRef}
          overscan={overscan}
          scrollRef={scrollContainerRef}
          startMargin={startMargin}
        >
          {renderedItems}
        </Virtualizer>
      ) : (
        <WindowVirtualizer ref={windowVirtualizerRef} overscan={overscan}>
          {renderedItems}
        </WindowVirtualizer>
      )}

      {isLoadingMore && loadingMoreContent}
    </>
  );
}
