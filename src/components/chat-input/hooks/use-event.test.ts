import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useEvent } from "./use-event";

describe("useEvent", () => {
  test("returns a stable callback reference across renders", () => {
    const { result, rerender } = renderHook(
      ({ factor }) =>
        useEvent((value: number) => {
          return value * factor;
        }),
      { initialProps: { factor: 2 } }
    );

    const initialHandler = result.current;
    expect(initialHandler(3)).toBe(6);

    act(() => {
      rerender({ factor: 4 });
    });

    expect(result.current).toBe(initialHandler);
    expect(result.current(3)).toBe(12);
  });

  test("always invokes the latest handler implementation", () => {
    const calls: number[] = [];

    const { result, rerender } = renderHook(
      ({ factor }) =>
        useEvent((value: number) => {
          const computed = value * factor;
          calls.push(computed);
          return computed;
        }),
      { initialProps: { factor: 1 } }
    );

    result.current(5);
    expect(calls).toEqual([5]);

    act(() => {
      rerender({ factor: 3 });
    });

    result.current(5);
    expect(calls).toEqual([5, 15]);
  });
});
