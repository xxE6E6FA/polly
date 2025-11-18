import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortConfig<TField extends string> {
  field: TField | null;
  direction: SortDirection;
}

/**
 * Hook for managing list sorting state
 * Supports sortable fields with ascending/descending toggle
 */
export function useListSort<TField extends string, TItem>(
  initialField: TField | null = null,
  initialDirection: SortDirection = "asc",
  getValue: (item: TItem, field: TField) => string | number,
  getStableValue?: (item: TItem) => string | number
) {
  const [sortField, setSortField] = useState<TField | null>(initialField);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialDirection);

  const toggleSort = useCallback(
    (field: TField) => {
      if (sortField === field) {
        // Toggle direction if same field
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        // Set new field with ascending direction
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField]
  );

  const sortItems = useCallback(
    (items: TItem[]) => {
      if (!sortField) {
        return items;
      }

      return [...items].sort((a, b) => {
        const aValue = getValue(a, sortField);
        const bValue = getValue(b, sortField);

        if (aValue < bValue) {
          return sortDirection === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDirection === "asc" ? 1 : -1;
        }

        // Stable secondary sort if values are equal
        if (getStableValue) {
          const aStable = getStableValue(a);
          const bStable = getStableValue(b);
          if (aStable < bStable) {
            return -1;
          }
          if (aStable > bStable) {
            return 1;
          }
          return 0;
        }

        return 0;
      });
    },
    [sortField, sortDirection, getValue, getStableValue]
  );

  return {
    sortField,
    sortDirection,
    toggleSort,
    sortItems,
    sortConfig: {
      field: sortField,
      direction: sortDirection,
    } as SortConfig<TField>,
  };
}

/**
 * Helper hook that returns a memoized sorted array
 */
export function useSortedItems<TField extends string, TItem>(
  items: TItem[],
  sortField: TField | null,
  sortDirection: SortDirection,
  getValue: (item: TItem, field: TField) => string | number
) {
  return useMemo(() => {
    if (!sortField) {
      return items;
    }

    return [...items].sort((a, b) => {
      const aValue = getValue(a, sortField);
      const bValue = getValue(b, sortField);

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [items, sortField, sortDirection, getValue]);
}
