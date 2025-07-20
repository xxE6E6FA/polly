import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { CACHE_KEYS, get as getLS, set as setLS } from "../lib/local-storage";

function withDisabledAnimations(fn: () => void) {
  const root = document.documentElement;
  root.classList.add("disable-animations");
  flushSync(fn);
  requestAnimationFrame(() => {
    root.classList.remove("disable-animations");
  });
}

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = getLS<Theme>(CACHE_KEYS.theme, "system");
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
      setLS<Theme>(CACHE_KEYS.theme, newTheme);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
