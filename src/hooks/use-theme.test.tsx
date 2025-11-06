import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";
import { useTheme } from "./use-theme";

const originalRAF = globalThis.requestAnimationFrame;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "light";
  // biome-ignore lint/suspicious/noExplicitAny: Test global mock
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 0;
  };
  // biome-ignore lint/suspicious/noExplicitAny: Test global mock
  (window as any).matchMedia = (query: string) => {
    const matches = false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {
        /* empty */
      },
      removeEventListener: () => {
        /* empty */
      },
      addListener: () => {
        /* empty */
      },
      removeListener: () => {
        /* empty */
      },
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
});

describe("useTheme", () => {
  test("initializes from localStorage and toggles", async () => {
    setLS(CACHE_KEYS.theme, "dark");

    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(getLS(CACHE_KEYS.theme, "system")).toBe("light");
  });

  test("system theme tracks matchMedia changes", async () => {
    const listeners: Array<(ev: MediaQueryListEvent) => void> = [];
    let systemMatches = false;
    // biome-ignore lint/suspicious/noExplicitAny: Test global mock
    (window as any).matchMedia = () => ({
      matches: systemMatches,
      media: "",
      onchange: null,
      addEventListener: (_: string, cb: (ev: MediaQueryListEvent) => void) => {
        listeners.push(cb);
      },
      removeEventListener: () => {
        /* empty */
      },
      addListener: () => {
        /* empty */
      },
      removeListener: () => {
        /* empty */
      },
      dispatchEvent: () => false,
    });

    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });

    act(() => {
      result.current.setTheme("system");
    });

    act(() => {
      systemMatches = true;
      listeners.forEach(listener =>
        listener({ matches: true } as MediaQueryListEvent)
      );
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRAF;
  window.matchMedia = originalMatchMedia;
});
