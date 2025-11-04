import { describe, expect, spyOn, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { advanceTimersByTime, withFakeTimers } from "../test/utils";
import { useHoverLinger } from "./use-hover-linger";

describe("useHoverLinger", () => {
  test("starts with isVisible false", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      expect(result.current.isVisible).toBe(false);
    });
  });

  test("shows immediately on mouse enter", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  test("hides after delay on mouse leave", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 500 }));
      act(() => {
        result.current.onMouseEnter();
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        result.current.onMouseLeave();
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        advanceTimersByTime(500);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });

  test("uses default delay of 700ms", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        advanceTimersByTime(699);
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        advanceTimersByTime(1);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });

  test("cancels hide timer when mouse re-enters", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 500 }));
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        advanceTimersByTime(250);
        result.current.onMouseEnter();
      });
      act(() => {
        advanceTimersByTime(300);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  test("allows manual control with setIsVisible", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.setIsVisible(true);
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        result.current.setIsVisible(false);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });

  test("provides clear function to cancel timers", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 500 }));
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        advanceTimersByTime(250);
        result.current.clear();
      });
      act(() => {
        advanceTimersByTime(300);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  test("cleans up timers on unmount", async () => {
    await withFakeTimers(() => {
      const clearTimeoutSpy = spyOn(global, "clearTimeout");
      const { result, unmount } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  test("handles multiple rapid mouse events", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 100 }));
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
        result.current.onMouseEnter();
        result.current.onMouseLeave();
        result.current.onMouseEnter();
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        result.current.onMouseLeave();
        advanceTimersByTime(100);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });
});
