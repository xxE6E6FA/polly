import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { get as getLS, set as setLS, subscribe } from "../lib/local-storage";

function withDisabledAnimations(fn: () => void) {
  const root = document.documentElement;
  root.classList.add("disable-animations");
  flushSync(fn);
  requestAnimationFrame(() => {
    root.classList.remove("disable-animations");
  });
}

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme/v1";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = getLS<Theme>(THEME_STORAGE_KEY, "light");
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    return prefersDark ? "dark" : "light";
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme, mounted]);

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
