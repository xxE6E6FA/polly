import { useCallback, useRef, useState } from "react";

interface UseListSelectionOptions {
  /** Enable shift+click range selection */
  enableShiftSelect?: boolean;
}

/**
 * Hook for managing multi-select list state
 * Supports individual item selection, select all/none, custom key extraction,
 * and optional shift+click range selection
 */
export function useListSelection<T>(
  getItemKey: (item: T) => string,
  options?: UseListSelectionOptions
) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const enableShiftSelect = options?.enableShiftSelect ?? false;

  const toggleItem = useCallback(
    (item: T) => {
      const key = getItemKey(item);
      setSelectedKeys(prev => {
        const newSet = new Set(prev);
        if (newSet.has(key)) {
          newSet.delete(key);
        } else {
          newSet.add(key);
        }
        return newSet;
      });
    },
    [getItemKey]
  );

  /**
   * Toggle item with shift+click range selection support
   * @param item - The item being clicked
   * @param index - The index of the item in the list
   * @param isShiftKey - Whether shift key is held
   * @param items - The full list of items (needed for range selection)
   */
  const toggleItemWithShift = useCallback(
    (item: T, index: number, isShiftKey: boolean, items: T[]) => {
      if (!enableShiftSelect) {
        toggleItem(item);
        lastSelectedIndexRef.current = index;
        return;
      }

      setSelectedKeys(prev => {
        const newSet = new Set(prev);
        const key = getItemKey(item);

        if (isShiftKey && lastSelectedIndexRef.current !== null) {
          // Range selection: select all items between last selected and current
          const start = Math.min(lastSelectedIndexRef.current, index);
          const end = Math.max(lastSelectedIndexRef.current, index);

          for (let i = start; i <= end; i++) {
            const rangeItem = items[i];
            if (rangeItem) {
              newSet.add(getItemKey(rangeItem));
            }
          }
        } else if (newSet.has(key)) {
          // Normal toggle - deselect
          newSet.delete(key);
        } else {
          // Normal toggle - select
          newSet.add(key);
        }

        return newSet;
      });

      lastSelectedIndexRef.current = index;
    },
    [enableShiftSelect, getItemKey, toggleItem]
  );

  const toggleAll = useCallback(
    (items: T[]) => {
      const allKeys = new Set(items.map(getItemKey));
      setSelectedKeys(prev => {
        // Check if all current items are actually selected
        const allSelected = items.every(item => prev.has(getItemKey(item)));

        if (allSelected) {
          // Deselect only the items in the current view
          const newSet = new Set(prev);
          items.forEach(item => newSet.delete(getItemKey(item)));
          return newSet;
        }

        // Select all items in current view, keeping any others already selected
        const newSet = new Set(prev);
        allKeys.forEach(key => newSet.add(key));
        return newSet;
      });

      // Update last selected index to end of list
      lastSelectedIndexRef.current = items.length - 1;
    },
    [getItemKey]
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    lastSelectedIndexRef.current = null;
  }, []);

  const isSelected = useCallback(
    (item: T) => {
      const key = getItemKey(item);
      return selectedKeys.has(key);
    },
    [selectedKeys, getItemKey]
  );

  const isAllSelected = useCallback(
    (items: T[]) => {
      if (items.length === 0) {
        return false;
      }
      return items.every(item => selectedKeys.has(getItemKey(item)));
    },
    [selectedKeys, getItemKey]
  );

  return {
    selectedKeys,
    selectedCount: selectedKeys.size,
    toggleItem,
    toggleItemWithShift,
    toggleAll,
    clearSelection,
    isSelected,
    isAllSelected,
  };
}
