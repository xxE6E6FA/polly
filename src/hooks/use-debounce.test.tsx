import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDebounce, useDebouncedCallback } from "./use-debounce";

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("useDebounce", () => {
  test("updates to latest value after delay", async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: "a", delay: 0 } }
    );

    expect(result.current).toBe("a");

    rerender({ value: "b", delay: 0 });

    await waitFor(() => {
      expect(result.current).toBe("b");
    });
  });
});

describe("useDebouncedCallback", () => {
  test("trailing execution", async () => {
    const calls: string[] = [];
    const cb = ((x: string) => {
      calls.push(x);
    }) as (...args: unknown[]) => void;
    const { result } = renderHook(() =>
      useDebouncedCallback(cb, 0, { trailing: true })
    );

    await act(async () => {
      result.current("one");
      await flush();
    });

    expect(calls).toEqual(["one"]);
  });

  test("leading execution without trailing", async () => {
    const calls: string[] = [];
    const cb = ((x: string) => {
      calls.push(x);
    }) as (...args: unknown[]) => void;
    const { result } = renderHook(() =>
      useDebouncedCallback(cb, 10, { leading: true, trailing: false })
    );

    await act(async () => {
      result.current("first");
      await flush();
    });

    expect(calls).toEqual(["first"]);
  });
});
