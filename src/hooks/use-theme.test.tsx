import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";
import { __resetThemeState, useTheme } from "./use-theme";

const originalRAF = globalThis.requestAnimationFrame;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "light";
  document.documentElement.removeAttribute("data-color-scheme");
  // Reset module-level state to match cleared localStorage
  __resetThemeState();
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 0;
  };
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
  test("initializes from localStorage and toggles", () => {
    setLS(CACHE_KEYS.theme, "dark");
    __resetThemeState(); // re-read after writing to LS

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(getLS(CACHE_KEYS.theme, "system")).toBe("light");
  });

  test("setColorScheme updates DOM and localStorage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setColorScheme("catppuccin");
    });

    expect(result.current.colorScheme).toBe("catppuccin");
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe(
      "catppuccin"
    );
    expect(getLS(CACHE_KEYS.colorScheme, "polly")).toBe("catppuccin");
  });

  test("previewScheme changes DOM without updating state", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.previewScheme("nord");
    });

    // DOM changed
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe(
      "nord"
    );
    // State unchanged (still default)
    expect(result.current.colorScheme).toBe("polly");

    act(() => {
      result.current.endPreview();
    });

    // DOM restored
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe(
      "polly"
    );
  });

  test("shared state across multiple hook instances", () => {
    const { result: a } = renderHook(() => useTheme());
    const { result: b } = renderHook(() => useTheme());

    act(() => {
      a.current.setColorScheme("dracula");
    });

    // Both instances see the update
    expect(a.current.colorScheme).toBe("dracula");
    expect(b.current.colorScheme).toBe("dracula");
  });

  test("endPreview restores committed state even from another instance", () => {
    const { result: a } = renderHook(() => useTheme());
    const { result: b } = renderHook(() => useTheme());

    act(() => {
      a.current.setColorScheme("nord");
    });

    act(() => {
      b.current.previewScheme("dracula");
    });

    // DOM shows preview
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe(
      "dracula"
    );

    act(() => {
      b.current.endPreview();
    });

    // Restores to the committed "nord" — not stale default
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe(
      "nord"
    );
  });
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRAF;
  window.matchMedia = originalMatchMedia;
});
