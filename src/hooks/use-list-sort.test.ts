import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useListSort, useSortedItems } from "./use-list-sort";

interface TestItem {
  id: string;
  name: string;
  count: number;
}

type TestField = "name" | "count";

const getValue = (item: TestItem, field: TestField): string | number => {
  return item[field];
};

describe("useListSort", () => {
  test("initializes with default values", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>(null, "asc", getValue)
    );

    expect(result.current.sortField).toBe(null);
    expect(result.current.sortDirection).toBe("asc");
    expect(result.current.sortConfig.field).toBe(null);
    expect(result.current.sortConfig.direction).toBe("asc");
  });

  test("initializes with custom field and direction", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "desc", getValue)
    );

    expect(result.current.sortField).toBe("name");
    expect(result.current.sortDirection).toBe("desc");
  });

  test("toggles sort direction when clicking same field", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );

    expect(result.current.sortDirection).toBe("asc");

    act(() => {
      result.current.toggleSort("name");
    });

    expect(result.current.sortField).toBe("name");
    expect(result.current.sortDirection).toBe("desc");

    act(() => {
      result.current.toggleSort("name");
    });

    expect(result.current.sortDirection).toBe("asc");
  });

  test("sets new field with ascending direction when switching fields", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "desc", getValue)
    );

    expect(result.current.sortField).toBe("name");
    expect(result.current.sortDirection).toBe("desc");

    act(() => {
      result.current.toggleSort("count");
    });

    expect(result.current.sortField).toBe("count");
    expect(result.current.sortDirection).toBe("asc");
  });

  test("returns original array when no sort field is set", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>(null, "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const sorted = result.current.sortItems(items);

    expect(sorted).toBe(items);
  });

  test("sorts items by string field in ascending order", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const sorted = result.current.sortItems(items);

    expect(sorted[0].name).toBe("Alice");
    expect(sorted[1].name).toBe("Bob");
    expect(sorted[2].name).toBe("Charlie");
  });

  test("sorts items by string field in descending order", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "desc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const sorted = result.current.sortItems(items);

    expect(sorted[0].name).toBe("Charlie");
    expect(sorted[1].name).toBe("Bob");
    expect(sorted[2].name).toBe("Alice");
  });

  test("sorts items by number field in ascending order", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("count", "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const sorted = result.current.sortItems(items);

    expect(sorted[0].count).toBe(1);
    expect(sorted[1].count).toBe(2);
    expect(sorted[2].count).toBe(3);
  });

  test("sorts items by number field in descending order", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("count", "desc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const sorted = result.current.sortItems(items);

    expect(sorted[0].count).toBe(3);
    expect(sorted[1].count).toBe(2);
    expect(sorted[2].count).toBe(1);
  });

  test("does not mutate original array", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const originalOrder = [...items];
    const sorted = result.current.sortItems(items);

    expect(sorted).not.toBe(items);
    expect(items).toEqual(originalOrder);
  });

  test("handles empty array", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );
    const items: TestItem[] = [];

    const sorted = result.current.sortItems(items);

    expect(sorted).toEqual([]);
  });

  test("handles single item array", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );
    const items: TestItem[] = [{ id: "1", name: "Alice", count: 1 }];

    const sorted = result.current.sortItems(items);

    expect(sorted).toEqual(items);
  });

  test("maintains stable sort for equal values", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("count", "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Alice", count: 1 },
      { id: "2", name: "Bob", count: 1 },
      { id: "3", name: "Charlie", count: 1 },
    ];

    const sorted = result.current.sortItems(items);

    // When all values are equal, order should be preserved
    expect(sorted[0].id).toBe("1");
    expect(sorted[1].id).toBe("2");
    expect(sorted[2].id).toBe("3");
  });

  test("updates sort when toggling field", () => {
    const { result } = renderHook(() =>
      useListSort<TestField, TestItem>("name", "asc", getValue)
    );
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    let sorted = result.current.sortItems(items);
    expect(sorted[0].name).toBe("Alice");

    act(() => {
      result.current.toggleSort("count");
    });

    sorted = result.current.sortItems(items);
    expect(sorted[0].count).toBe(1);
    expect(sorted[0].name).toBe("Alice");
  });
});

describe("useSortedItems", () => {
  test("returns original array when no sort field is set", () => {
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
    ];

    const { result } = renderHook(() =>
      useSortedItems<TestField, TestItem>(items, null, "asc", getValue)
    );

    expect(result.current).toBe(items);
  });

  test("sorts items by field", () => {
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
      { id: "3", name: "Bob", count: 2 },
    ];

    const { result } = renderHook(() =>
      useSortedItems<TestField, TestItem>(items, "name", "asc", getValue)
    );

    expect(result.current[0].name).toBe("Alice");
    expect(result.current[1].name).toBe("Bob");
    expect(result.current[2].name).toBe("Charlie");
  });

  test("updates when items change", () => {
    const initialItems: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
    ];

    const { result, rerender } = renderHook(
      ({ items }) =>
        useSortedItems<TestField, TestItem>(items, "name", "asc", getValue),
      { initialProps: { items: initialItems } }
    );

    expect(result.current[0].name).toBe("Alice");

    const newItems: TestItem[] = [
      { id: "3", name: "Zoe", count: 5 },
      { id: "4", name: "Alex", count: 4 },
    ];

    rerender({ items: newItems });

    expect(result.current[0].name).toBe("Alex");
    expect(result.current[1].name).toBe("Zoe");
  });

  test("updates when sort direction changes", () => {
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
    ];

    const { result, rerender } = renderHook(
      ({ direction }) =>
        useSortedItems<TestField, TestItem>(items, "name", direction, getValue),
      { initialProps: { direction: "asc" as const } }
    );

    expect(result.current[0].name).toBe("Alice");

    rerender({ direction: "desc" });

    expect(result.current[0].name).toBe("Charlie");
  });

  test("updates when sort field changes", () => {
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 1 },
      { id: "2", name: "Alice", count: 2 },
    ];

    const { result, rerender } = renderHook(
      ({ field }) =>
        useSortedItems<TestField, TestItem>(items, field, "asc", getValue),
      { initialProps: { field: "name" as TestField } }
    );

    expect(result.current[0].name).toBe("Alice");

    rerender({ field: "count" });

    expect(result.current[0].count).toBe(1);
    expect(result.current[0].name).toBe("Charlie");
  });

  test("memoizes result when dependencies don't change", () => {
    const items: TestItem[] = [
      { id: "1", name: "Charlie", count: 3 },
      { id: "2", name: "Alice", count: 1 },
    ];

    const { result, rerender } = renderHook(() =>
      useSortedItems<TestField, TestItem>(items, "name", "asc", getValue)
    );

    const firstResult = result.current;

    rerender();

    // Should return same reference if nothing changed
    expect(result.current).toBe(firstResult);
  });
});
