import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { withFakeTimers } from "../test/utils";
import { useHoverLinger } from "./use-hover-linger";

describe("useHoverLinger", () => {
  it("starts with isVisible false", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("shows immediately on mouse enter", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  it("hides after delay on mouse leave", async () => {
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
        vi.advanceTimersByTime(500);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("uses default delay of 700ms", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        vi.advanceTimersByTime(699);
      });
      expect(result.current.isVisible).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("cancels hide timer when mouse re-enters", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 500 }));
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        vi.advanceTimersByTime(250);
        result.current.onMouseEnter();
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  it("allows manual control with setIsVisible", async () => {
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

  it("provides clear function to cancel timers", async () => {
    await withFakeTimers(() => {
      const { result } = renderHook(() => useHoverLinger({ delay: 500 }));
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      act(() => {
        vi.advanceTimersByTime(250);
        result.current.clear();
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  it("cleans up timers on unmount", async () => {
    await withFakeTimers(() => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const { result, unmount } = renderHook(() => useHoverLinger());
      act(() => {
        result.current.onMouseEnter();
        result.current.onMouseLeave();
      });
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  it("handles multiple rapid mouse events", async () => {
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
        vi.advanceTimersByTime(100);
      });
      expect(result.current.isVisible).toBe(false);
    });
  });
});
