import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { withFakeTimers } from "../test/utils";
import { useDebounce, useDebouncedCallback } from "./use-debounce";

describe("useDebounce", () => {
  it("delays value updates by the specified delay", async () => {
    await withFakeTimers(() => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 200),
        { initialProps: { value: "a" } }
      );

      expect(result.current).toBe("a");
      rerender({ value: "b" });
      expect(result.current).toBe("a");
      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(result.current).toBe("a");
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe("b");
    });
  });
});

describe("useDebouncedCallback", () => {
  it("invokes trailing callback after delay", async () => {
    await withFakeTimers(() => {
      const spy = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(spy, 100));
      act(() => {
        result.current("x");
        result.current("y");
        vi.advanceTimersByTime(99);
      });
      expect(spy).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith("y");
    });
  });

  it("supports leading option", async () => {
    await withFakeTimers(() => {
      const spy = vi.fn();
      const { result } = renderHook(() =>
        useDebouncedCallback(spy, 100, { leading: true, trailing: false })
      );
      act(() => {
        result.current(1);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1);
    });
  });
});
