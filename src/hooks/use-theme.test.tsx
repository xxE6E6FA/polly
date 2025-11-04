import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useTheme } from "./use-theme";

let getLSMock: ReturnType<typeof mock>;
let setLSMock: ReturnType<typeof mock>;

mock.module("../lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  CACHE_KEYS: { theme: "theme" },
  get: (...args: unknown[]) => getLSMock(...args),
  set: (...args: unknown[]) => setLSMock(...args),
}));

mock.module("react-dom", () => ({
  flushSync: (fn: () => void) => fn(),
}));

import { get as getLS, set as setLS } from "../lib/local-storage";

describe("useTheme", () => {
  let documentElementMock: {
    classList: {
      add: ReturnType<typeof mock>;
      remove: ReturnType<typeof mock>;
      contains: ReturnType<typeof mock>;
    };
  };

  let matchMediaMock: ReturnType<typeof mock>;
  let originalClassList: typeof document.documentElement.classList;
  let originalMatchMedia: typeof window.matchMedia;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

  beforeEach(() => {
    getLSMock = mock();
    setLSMock = mock();

    // Store originals for restoration
    originalClassList = document.documentElement.classList;
    originalMatchMedia = window.matchMedia;
    originalRequestAnimationFrame = window.requestAnimationFrame;

    // Mock document.documentElement.classList instead of replacing documentElement
    // This prevents breaking Happy DOM's internal cache
    documentElementMock = {
      classList: {
        add: mock(),
        remove: mock(),
        contains: mock().mockReturnValue(false),
      },
    };
    Object.defineProperty(document.documentElement, "classList", {
      value: documentElementMock.classList,
      writable: true,
      configurable: true,
    });

    // Mock window.matchMedia
    matchMediaMock = mock().mockReturnValue({
      matches: false,
      addEventListener: mock(),
      removeEventListener: mock(),
    });
    Object.defineProperty(window, "matchMedia", {
      value: matchMediaMock,
      writable: true,
      configurable: true,
    });

    // Mock requestAnimationFrame
    Object.defineProperty(window, "requestAnimationFrame", {
      value: (fn: () => void) => setTimeout(fn, 0),
      writable: true,
      configurable: true,
    });

    getLSMock.mockReturnValue("system");
  });

  afterEach(() => {
    // Restore original values to prevent state pollution
    Object.defineProperty(document.documentElement, "classList", {
      value: originalClassList,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "requestAnimationFrame", {
      value: originalRequestAnimationFrame,
      writable: true,
      configurable: true,
    });
  });

  test("initializes with stored theme", () => {
    getLSMock.mockReturnValue("dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(result.current.mounted).toBe(true);
  });

  test("defaults to system theme when no stored theme", () => {
    getLSMock.mockReturnValue("system");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
  });

  test("sets mounted to true after first render", async () => {
    const { result } = renderHook(() => useTheme());

    // In the test environment, mounted is set synchronously
    expect(result.current.mounted).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.mounted).toBe(true);
  });

  test("applies light theme to document", async () => {
    getLSMock.mockReturnValue("light");
    documentElementMock.classList.contains.mockReturnValue(false);

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.remove).toHaveBeenCalledWith(
      "light",
      "dark"
    );
    expect(documentElementMock.classList.add).toHaveBeenCalledWith("light");
  });

  test("applies dark theme to document", async () => {
    getLSMock.mockReturnValue("dark");
    // Mock that current class is "light" so that theme change is detected
    documentElementMock.classList.contains.mockImplementation(
      (cls: string) => cls === "light"
    );

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.remove).toHaveBeenCalledWith(
      "light",
      "dark"
    );
    expect(documentElementMock.classList.add).toHaveBeenCalledWith("dark");
  });

  test("resolves system theme to dark when prefers dark", async () => {
    getLSMock.mockReturnValue("system");
    const addEventListenerMock = mock();
    const removeEventListenerMock = mock();
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    });
    // Mock that current class is "light" so that theme change is detected
    documentElementMock.classList.contains.mockImplementation(
      (cls: string) => cls === "light"
    );

    const { unmount } = renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(documentElementMock.classList.add).toHaveBeenCalledWith("dark");
    expect(addEventListenerMock).toHaveBeenCalled();

    unmount();
    expect(removeEventListenerMock).toHaveBeenCalled();
  });

  test("resolves system theme to light when prefers light", async () => {
    getLSMock.mockReturnValue("system");
    const addEventListenerMock = mock();
    const removeEventListenerMock = mock();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    });
    documentElementMock.classList.contains.mockReturnValue(false);

    const { unmount } = renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.add).toHaveBeenCalledWith("light");
    expect(addEventListenerMock).toHaveBeenCalled();

    unmount();
    expect(removeEventListenerMock).toHaveBeenCalled();
  });

  test("does not update DOM if theme hasn't changed", async () => {
    getLSMock.mockReturnValue("light");
    documentElementMock.classList.contains.mockReturnValue(true); // Already light

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.remove).not.toHaveBeenCalled();
    expect(documentElementMock.classList.add).not.toHaveBeenCalled();
  });

  test("setTheme updates theme and saves to localStorage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(setLSMock).toHaveBeenCalledWith("theme", "dark");
  });

  test("setTheme disables animations during transition", async () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(documentElementMock.classList.add).toHaveBeenCalledWith(
      "disable-animations"
    );

    // Wait for requestAnimationFrame
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(documentElementMock.classList.remove).toHaveBeenCalledWith(
      "disable-animations"
    );
  });

  test("toggleTheme switches between light and dark", () => {
    getLSMock.mockReturnValue("light");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(setLSMock).toHaveBeenCalledWith("theme", "dark");
  });

  test("toggleTheme switches from dark to light", () => {
    getLSMock.mockReturnValue("dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(setLSMock).toHaveBeenCalledWith("theme", "light");
  });

  test("toggleTheme from system switches to light", () => {
    getLSMock.mockReturnValue("system");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
  });

  test("does not apply theme changes before mounting", () => {
    getLSMock.mockReturnValue("dark");
    renderHook(() => useTheme());

    // Should not apply theme changes before mounted = true
    expect(documentElementMock.classList.add).not.toHaveBeenCalled();
    expect(documentElementMock.classList.remove).not.toHaveBeenCalled();
  });

  test("maintains stable callback references", () => {
    const { result, rerender } = renderHook(() => useTheme());

    const firstSetTheme = result.current.setTheme;
    const firstToggleTheme = result.current.toggleTheme;

    rerender();

    expect(result.current.setTheme).toBe(firstSetTheme);
    expect(result.current.toggleTheme).toBe(firstToggleTheme);
  });

  test("updates toggleTheme when current theme changes", () => {
    const { result } = renderHook(() => useTheme());

    // Start with system (will toggle to light)
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");

    // Now toggle to dark
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
  });
});
