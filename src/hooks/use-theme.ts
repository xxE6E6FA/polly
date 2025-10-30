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
    return stored;
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const updateTheme = () => {
      let actualTheme: "light" | "dark";
      if (theme === "light" || theme === "dark") {
        actualTheme = theme;
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        actualTheme = prefersDark ? "dark" : "light";
      }

      const root = document.documentElement;
      const currentTheme = root.classList.contains("light") ? "light" : "dark";
      if (currentTheme !== actualTheme) {
        root.classList.remove("light", "dark");
        root.classList.add(actualTheme);
      }
    };

    updateTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        updateTheme();
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }
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
