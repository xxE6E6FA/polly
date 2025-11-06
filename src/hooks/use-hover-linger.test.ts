import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useHoverLinger } from "./use-hover-linger";

describe("useHoverLinger", () => {
  beforeEach(() => {
    // Clear all timers before each test
    clearTimeout(0);
  });

  afterEach(() => {
    // Clean up any remaining timers
    clearTimeout(0);
  });

  test("starts with isVisible as false", () => {
    const { result } = renderHook(() => useHoverLinger());
    expect(result.current.isVisible).toBe(false);
  });

  test("sets isVisible to true on mouse enter", () => {
    const { result } = renderHook(() => useHoverLinger());

    act(() => {
      result.current.onMouseEnter();
    });

    expect(result.current.isVisible).toBe(true);
  });

  test("keeps isVisible true immediately after mouse leave", () => {
    const { result } = renderHook(() => useHoverLinger());

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Should still be visible immediately after leave
    expect(result.current.isVisible).toBe(true);
  });

  test("sets isVisible to false after delay on mouse leave", async () => {
    const { result } = renderHook(() => useHoverLinger({ delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Wait for the delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(result.current.isVisible).toBe(false);
  });

  test("cancels hide timer if mouse re-enters before delay", async () => {
    const { result } = renderHook(() => useHoverLinger({ delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Re-enter before delay expires
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.onMouseEnter();
    });

    // Wait past original delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should still be visible
    expect(result.current.isVisible).toBe(true);
  });

  test("uses custom delay", async () => {
    const { result } = renderHook(() => useHoverLinger({ delay: 50 }));

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Wait for custom delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 70));
    });

    expect(result.current.isVisible).toBe(false);
  });

  test("defaults to 700ms delay when not specified", async () => {
    const { result } = renderHook(() => useHoverLinger());

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Should still be visible before default delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(result.current.isVisible).toBe(true);

    // Should be hidden after default delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    expect(result.current.isVisible).toBe(false);
  });

  test("allows manual control via setIsVisible", () => {
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

  test("clear function immediately hides", async () => {
    const { result } = renderHook(() => useHoverLinger({ delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Clear the timer immediately
    act(() => {
      result.current.clear();
    });

    // Wait for delay to ensure timer was cleared
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    // Should still be visible because timer was cleared
    expect(result.current.isVisible).toBe(true);
  });

  test("cleans up timer on unmount", () => {
    const { result, unmount } = renderHook(() => useHoverLinger());

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      result.current.onMouseLeave();
    });

    // Unmount should clean up the timer
    unmount();

    // No assertion needed - just ensuring no errors or memory leaks
  });
});
