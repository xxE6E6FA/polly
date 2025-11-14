import { useCallback, useState } from "react";

/**
 * Hook for managing multi-select list state
 * Supports individual item selection, select all/none, and custom key extraction
 */
export function useListSelection<T>(getItemKey: (item: T) => string) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

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

  const toggleAll = useCallback(
    (items: T[]) => {
      const allKeys = new Set(items.map(getItemKey));
      setSelectedKeys(prev => {
        // If all items are selected, deselect all; otherwise select all
        if (prev.size === allKeys.size) {
          return new Set();
        }
        return allKeys;
      });
    },
    [getItemKey]
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
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
    toggleAll,
    clearSelection,
    isSelected,
    isAllSelected,
  };
}
