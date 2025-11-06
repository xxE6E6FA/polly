import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

describe("useDebouncedValue", () => {
  test("updates after the specified delay", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 10),
      {
        initialProps: { value: "initial" },
      }
    );

    expect(result.current).toBe("initial");

    await act(() => {
      rerender({ value: "updated" });
    });

    expect(result.current).toBe("initial");

    await act(async () => {
      await sleep(15);
    });

    expect(result.current).toBe("updated");
  });

  test("only emits the latest value when changes happen rapidly", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 10),
      {
        initialProps: { value: "start" },
      }
    );

    await act(() => {
      rerender({ value: "first" });
      rerender({ value: "second" });
      rerender({ value: "final" });
    });

    expect(result.current).toBe("start");

    await act(async () => {
      await sleep(12);
    });

    expect(result.current).toBe("final");
  });
});
