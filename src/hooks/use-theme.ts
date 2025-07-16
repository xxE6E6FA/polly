import { useCallback, useEffect, useState } from "react";
import { get as getLS, set as setLS, subscribe } from "../lib/local-storage";

function withDisabledAnimations(fn: () => void) {
  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after {
      transition: none !important;
      animation: none !important;
    }
  `;
  document.head.appendChild(style);
  fn();
  document.head.removeChild(style);
}

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme/v1";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    // Check localStorage first
    const stored = getLS<Theme>(THEME_STORAGE_KEY, "light");
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    // Check system preference
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    return prefersDark ? "dark" : "light";
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep HTML class in sync
  useEffect(() => {
    if (!mounted) {
      return;
    }

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme, mounted]);

  // Persist to storage & notify
  const setTheme = useCallback((newTheme: Theme) => {
    withDisabledAnimations(() => {
      setThemeState(newTheme);
      setLS<Theme>(THEME_STORAGE_KEY, newTheme);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  // Sync with other tabs
  useEffect(() => {
    return subscribe(THEME_STORAGE_KEY, () => {
      setThemeState(getLS<Theme>(THEME_STORAGE_KEY, "light"));
    });
  }, []);

  return { theme, setTheme, toggleTheme, mounted } as const;
}
