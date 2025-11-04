import { describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { createHashMemoComparison, usePropsHash } from "./use-props-hash";

describe("usePropsHash", () => {
  test("produces stable hash for same props and changes when values change", () => {
    const props = { a: 1, b: "x", c: true } as const;
    const { result, rerender } = renderHook(({ p }) => usePropsHash(p), {
      initialProps: { p: props as Record<string, unknown> },
    });

    const first = result.current;
    rerender({ p: { a: 1, b: "x", c: true } });
    const second = result.current;
    expect(second).toBe(first);

    // Change a primitive changes the hash
    rerender({ p: { a: 2, b: "x", c: true } });
    const third = result.current;
    expect(third).not.toBe(first);
  });

  test("function references are hashed by name, not identity", () => {
    const fn1 = function cb() {
      /* no-op */
    };
    const fn2 = function cb() {
      /* different identity, same name */
    };
    const { result, rerender } = renderHook(({ p }) => usePropsHash(p), {
      initialProps: { p: { onClick: fn1 } },
    });
    const first = result.current;
    rerender({ p: { onClick: fn2 } });
    const second = result.current;
    // Same name => treated as equal per implementation
    expect(second).toBe(first);
  });

  test("object/array props use shape/length in hash", () => {
    const { result, rerender } = renderHook(({ p }) => usePropsHash(p), {
      initialProps: { p: { items: [1, 2], cfg: { x: 1, y: 2 } } },
    });
    const first = result.current;
    // Same length and key shape => considered equal
    rerender({ p: { items: [3, 4], cfg: { y: 0, x: 9 } } });
    expect(result.current).toBe(first);
    // Change length or keys => different hash
    rerender({ p: { items: [1, 2, 3], cfg: { x: 1, y: 2 } } });
    expect(result.current).not.toBe(first);
  });
});

describe("createHashMemoComparison", () => {
  test("returns true for same reference", () => {
    const cmp = createHashMemoComparison<Record<string, unknown>>();
    const obj = { a: 1 };
    expect(cmp(obj, obj)).toBe(true);
  });

  test("detects differences in primitives and objects", () => {
    const cmp = createHashMemoComparison<Record<string, unknown>>();
    expect(cmp({ a: 1 }, { a: 2 })).toBe(false);
    expect(cmp({ a: { x: 1 } }, { a: { y: 1 } })).toBe(false);
    expect(cmp({ a: [1] }, { a: [1, 2] })).toBe(false);
  });

  test("treats functions by name and ignores excluded keys", () => {
    const cmp = createHashMemoComparison<{
      onClick: () => void;
      transient: number;
    }>(["transient"]);
    const a1 = function action() {
      // Empty function for testing
    };
    const a2 = function action() {
      // Empty function for testing
    };
    // Functions with same name considered equal
    expect(
      cmp({ onClick: a1, transient: 1 }, { onClick: a2, transient: 99 })
    ).toBe(true);
  });

  test("treats arrays with same length as equal even if values differ", () => {
    const cmp = createHashMemoComparison<{ items: number[] }>();
    expect(cmp({ items: [1, 2, 3] }, { items: [9, 9, 9] })).toBe(true);
  });
});
