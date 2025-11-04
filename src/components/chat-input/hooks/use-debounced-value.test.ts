import { describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";
import { advanceTimersByTime, withFakeTimers } from "../../../test/utils";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  test("returns initial value immediately and updates after delay", async () => {
    await withFakeTimers(() => {
      const { result, rerender } = renderHook(
        ({ v, d }) => useDebouncedValue(v, d),
        {
          initialProps: { v: "a", d: 200 },
        }
      );
      expect(result.current).toBe("a");
      rerender({ v: "b", d: 200 });
      expect(result.current).toBe("a");
      act(() => advanceTimersByTime(199));
      expect(result.current).toBe("a");
      act(() => advanceTimersByTime(1));
      expect(result.current).toBe("b");
    });
  });

  test("resets timer when value changes before delay", async () => {
    await withFakeTimers(() => {
      const { result, rerender } = renderHook(
        ({ v, d }) => useDebouncedValue(v, d),
        {
          initialProps: { v: 0, d: 100 },
        }
      );
      rerender({ v: 1, d: 100 });
      act(() => advanceTimersByTime(90));
      rerender({ v: 2, d: 100 });
      // Should not update yet due to reset
      expect(result.current).toBe(0);
      act(() => advanceTimersByTime(100));
      expect(result.current).toBe(2);
    });
  });
});
