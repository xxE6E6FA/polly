import { useCallback, useEffect, useState } from "react";

import { withDisabledAnimations } from "@/lib/theme-utils";
import { useServerTheme } from "@/providers/theme-provider";

export function useTheme() {
  const serverTheme = useServerTheme();
  const [mounted, setMounted] = useState(false);
  const [clientTheme, setClientTheme] = useState<"light" | "dark">(serverTheme);

  useEffect(() => {
    setMounted(true);

    try {
      // First try to read from localStorage
      const storedTheme = localStorage.getItem("theme") as
        | "light"
        | "dark"
        | null;

      if (storedTheme && (storedTheme === "light" || storedTheme === "dark")) {
        // Apply stored theme to HTML
        const htmlElement = document.documentElement;
        htmlElement.classList.remove("light", "dark");
        htmlElement.classList.add(storedTheme);
        setClientTheme(storedTheme);
      } else {
        // Fallback: Read current theme from HTML class
        const htmlElement = document.documentElement;
        const currentTheme = htmlElement.classList.contains("dark")
          ? "dark"
          : "light";
        setClientTheme(currentTheme);
      }
    } catch (error) {
      console.error("Error reading theme from localStorage:", error);
      // Fallback: Read current theme from HTML class
      const htmlElement = document.documentElement;
      const currentTheme = htmlElement.classList.contains("dark")
        ? "dark"
        : "light";
      setClientTheme(currentTheme);
    }
  }, []);

  const theme = mounted ? clientTheme : serverTheme;

  const setTheme = useCallback((newTheme: "light" | "dark") => {
    withDisabledAnimations(() => {
      // Update HTML class immediately
      const htmlElement = document.documentElement;
      htmlElement.classList.remove("light", "dark");
      htmlElement.classList.add(newTheme);

      // Update state
      setClientTheme(newTheme);

      // Update localStorage instead of cookie
      try {
        localStorage.setItem("theme", newTheme);
      } catch (error) {
        console.error("Error saving theme to localStorage:", error);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  }, [theme, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
