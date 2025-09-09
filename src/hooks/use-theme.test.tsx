import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./use-theme";

// Mock dependencies
vi.mock("../lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  CACHE_KEYS: { theme: "theme" },
  get: vi.fn(),
  set: vi.fn(),
}));

// Helper to mock localStorage get - return raw data since the mock replaces the real get function
const mockGetLS = (value: unknown) => {
  vi.mocked(getLS).mockReturnValue(value);
};

vi.mock("react-dom", () => ({
  flushSync: (fn: () => void) => fn(),
}));

import { get as getLS, set as setLS } from "../lib/local-storage";

describe("useTheme", () => {
  let documentElementMock: {
    classList: {
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      contains: ReturnType<typeof vi.fn>;
    };
  };

  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock document.documentElement
    documentElementMock = {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(false),
      },
    };
    Object.defineProperty(document, "documentElement", {
      value: documentElementMock,
      writable: true,
    });

    // Mock window.matchMedia
    matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      value: matchMediaMock,
      writable: true,
    });

    // Mock requestAnimationFrame
    Object.defineProperty(window, "requestAnimationFrame", {
      value: (fn: () => void) => setTimeout(fn, 0),
      writable: true,
    });

    mockGetLS("system");
  });

  it("initializes with stored theme", () => {
    mockGetLS("dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(result.current.mounted).toBe(true);
  });

  it("defaults to system theme when no stored theme", () => {
    mockGetLS("system");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
  });

  it("sets mounted to true after first render", async () => {
    const { result } = renderHook(() => useTheme());

    // In the test environment, mounted is set synchronously
    expect(result.current.mounted).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.mounted).toBe(true);
  });

  it("applies light theme to document", async () => {
    mockGetLS("light");
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

  it("applies dark theme to document", async () => {
    mockGetLS("dark");
    // Mock that current class is "light" so that theme change is detected
    documentElementMock.classList.contains.mockImplementation(
      cls => cls === "light"
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

  it("resolves system theme to dark when prefers dark", async () => {
    mockGetLS("system");
    matchMediaMock.mockReturnValue({ matches: true });
    // Mock that current class is "light" so that theme change is detected
    documentElementMock.classList.contains.mockImplementation(
      cls => cls === "light"
    );

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(documentElementMock.classList.add).toHaveBeenCalledWith("dark");
  });

  it("resolves system theme to light when prefers light", async () => {
    mockGetLS("system");
    matchMediaMock.mockReturnValue({ matches: false });
    documentElementMock.classList.contains.mockReturnValue(false);

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.add).toHaveBeenCalledWith("light");
  });

  it("does not update DOM if theme hasn't changed", async () => {
    mockGetLS("light");
    documentElementMock.classList.contains.mockReturnValue(true); // Already light

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(documentElementMock.classList.remove).not.toHaveBeenCalled();
    expect(documentElementMock.classList.add).not.toHaveBeenCalled();
  });

  it("setTheme updates theme and saves to localStorage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(setLS).toHaveBeenCalledWith("theme", "dark");
  });

  it("setTheme disables animations during transition", async () => {
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

  it("toggleTheme switches between light and dark", () => {
    mockGetLS("light");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(setLS).toHaveBeenCalledWith("theme", "dark");
  });

  it("toggleTheme switches from dark to light", () => {
    mockGetLS("dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(setLS).toHaveBeenCalledWith("theme", "light");
  });

  it("toggleTheme from system switches to light", () => {
    mockGetLS("system");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
  });

  it("does not apply theme changes before mounting", () => {
    mockGetLS("dark");
    renderHook(() => useTheme());

    // Should not apply theme changes before mounted = true
    expect(documentElementMock.classList.add).not.toHaveBeenCalled();
    expect(documentElementMock.classList.remove).not.toHaveBeenCalled();
  });

  it("maintains stable callback references", () => {
    const { result, rerender } = renderHook(() => useTheme());

    const firstSetTheme = result.current.setTheme;
    const firstToggleTheme = result.current.toggleTheme;

    rerender();

    expect(result.current.setTheme).toBe(firstSetTheme);
    expect(result.current.toggleTheme).toBe(firstToggleTheme);
  });

  it("updates toggleTheme when current theme changes", () => {
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
