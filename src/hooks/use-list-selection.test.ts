import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useListSelection } from "./use-list-selection";

interface TestItem {
  id: string;
  name: string;
}

const getItemKey = (item: TestItem) => item.id;

describe("useListSelection", () => {
  test("initializes with empty selection", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));

    expect(result.current.selectedCount).toBe(0);
    expect(result.current.selectedKeys.size).toBe(0);
  });

  test("toggles individual item selection", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));
    const item: TestItem = { id: "1", name: "Item 1" };

    // Select item
    act(() => {
      result.current.toggleItem(item);
    });

    expect(result.current.isSelected(item)).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    // Deselect item
    act(() => {
      result.current.toggleItem(item);
    });

    expect(result.current.isSelected(item)).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  test("selects multiple items independently", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));
    const item1: TestItem = { id: "1", name: "Item 1" };
    const item2: TestItem = { id: "2", name: "Item 2" };

    act(() => {
      result.current.toggleItem(item1);
      result.current.toggleItem(item2);
    });

    expect(result.current.isSelected(item1)).toBe(true);
    expect(result.current.isSelected(item2)).toBe(true);
    expect(result.current.selectedCount).toBe(2);
  });

  test("clears all selections", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));
    const items: TestItem[] = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
      { id: "3", name: "Item 3" },
    ];

    act(() => {
      items.forEach(item => result.current.toggleItem(item));
    });

    expect(result.current.selectedCount).toBe(3);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedCount).toBe(0);
    items.forEach(item => {
      expect(result.current.isSelected(item)).toBe(false);
    });
  });

  test("isAllSelected returns false for empty list", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));

    expect(result.current.isAllSelected([])).toBe(false);
  });

  test("isAllSelected returns true when all items are selected", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));
    const items: TestItem[] = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ];

    act(() => {
      items.forEach(item => result.current.toggleItem(item));
    });

    expect(result.current.isAllSelected(items)).toBe(true);
  });

  test("isAllSelected returns false when some items are not selected", () => {
    const { result } = renderHook(() => useListSelection(getItemKey));
    const items: TestItem[] = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ];

    act(() => {
      result.current.toggleItem(items[0]);
    });

    expect(result.current.isAllSelected(items)).toBe(false);
  });

  describe("toggleAll", () => {
    test("selects all items when none are selected", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const items: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
      ];

      act(() => {
        result.current.toggleAll(items);
      });

      expect(result.current.selectedCount).toBe(3);
      items.forEach(item => {
        expect(result.current.isSelected(item)).toBe(true);
      });
    });

    test("deselects all items when all are selected", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const items: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ];

      // Select all first
      act(() => {
        result.current.toggleAll(items);
      });

      expect(result.current.selectedCount).toBe(2);

      // Toggle all again should deselect
      act(() => {
        result.current.toggleAll(items);
      });

      expect(result.current.selectedCount).toBe(0);
      items.forEach(item => {
        expect(result.current.isSelected(item)).toBe(false);
      });
    });

    test("selects remaining items when some are selected", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const items: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
      ];

      // Select one item manually
      act(() => {
        result.current.toggleItem(items[0]);
      });

      expect(result.current.selectedCount).toBe(1);

      // Toggle all should select remaining items
      act(() => {
        result.current.toggleAll(items);
      });

      expect(result.current.selectedCount).toBe(3);
      items.forEach(item => {
        expect(result.current.isSelected(item)).toBe(true);
      });
    });

    test("handles filtering scenario - preserves selections outside current view", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const allItems: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
        { id: "4", name: "Item 4" },
        { id: "5", name: "Item 5" },
      ];

      // Select first 3 items
      act(() => {
        result.current.toggleAll(allItems.slice(0, 3));
      });

      expect(result.current.selectedCount).toBe(3);

      // User filters list to show different items (4 and 5)
      const filteredItems = allItems.slice(3, 5);

      // Toggle all on filtered view should select those items too
      act(() => {
        result.current.toggleAll(filteredItems);
      });

      // Should have all 5 items selected now
      expect(result.current.selectedCount).toBe(5);
    });

    test("handles filtering scenario - deselects only visible items", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const allItems: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
        { id: "4", name: "Item 4" },
        { id: "5", name: "Item 5" },
      ];

      // Select all items
      act(() => {
        result.current.toggleAll(allItems);
      });

      expect(result.current.selectedCount).toBe(5);

      // User filters to show only first 2 items
      const filteredItems = allItems.slice(0, 2);

      // Toggle all should deselect only visible items
      act(() => {
        result.current.toggleAll(filteredItems);
      });

      // Should have 3 items selected (items 3, 4, 5 from original selection)
      expect(result.current.selectedCount).toBe(3);
      expect(result.current.isSelected(allItems[0])).toBe(false);
      expect(result.current.isSelected(allItems[1])).toBe(false);
      expect(result.current.isSelected(allItems[2])).toBe(true);
      expect(result.current.isSelected(allItems[3])).toBe(true);
      expect(result.current.isSelected(allItems[4])).toBe(true);
    });

    test("handles edge case - same number of items but different items", () => {
      const { result } = renderHook(() => useListSelection(getItemKey));
      const firstSet: TestItem[] = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
      ];
      const secondSet: TestItem[] = [
        { id: "4", name: "Item 4" },
        { id: "5", name: "Item 5" },
        { id: "6", name: "Item 6" },
      ];

      // Select first set
      act(() => {
        result.current.toggleAll(firstSet);
      });

      expect(result.current.selectedCount).toBe(3);

      // Toggle all on second set (same size, different items)
      // Should select the new items, not deselect
      act(() => {
        result.current.toggleAll(secondSet);
      });

      // Should have all 6 items selected
      expect(result.current.selectedCount).toBe(6);
      firstSet.forEach(item => {
        expect(result.current.isSelected(item)).toBe(true);
      });
      secondSet.forEach(item => {
        expect(result.current.isSelected(item)).toBe(true);
      });
    });
  });

  test("uses custom key extractor", () => {
    const customKeyExtractor = (item: TestItem) => item.name;
    const { result } = renderHook(() => useListSelection(customKeyExtractor));
    const item1: TestItem = { id: "1", name: "Unique Name" };
    const item2: TestItem = { id: "2", name: "Unique Name" }; // Same name, different id

    act(() => {
      result.current.toggleItem(item1);
    });

    // item2 should also be considered selected because they have the same name
    expect(result.current.isSelected(item2)).toBe(true);
  });
});
