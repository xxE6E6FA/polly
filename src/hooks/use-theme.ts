import { useSyncExternalStore } from "react";
import type { ColorScheme } from "../lib/color-schemes";
import { DEFAULT_COLOR_SCHEME } from "../lib/color-schemes";
import { CACHE_KEYS, get as getLS, set as setLS } from "../lib/local-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";

function applyModeToDOM(mode: Theme) {
  const root = document.documentElement;
  let actual: "light" | "dark";
  if (mode === "light" || mode === "dark") {
    actual = mode;
  } else {
    actual = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  root.classList.remove("light", "dark");
  root.classList.add(actual);
}

function applySchemeToDOM(scheme: string) {
  document.documentElement.setAttribute("data-color-scheme", scheme);
}

function withDisabledAnimations(fn: () => void) {
  const root = document.documentElement;
  root.classList.add("disable-animations");
  fn();
  requestAnimationFrame(() => {
    root.classList.remove("disable-animations");
  });
}

// ---------------------------------------------------------------------------
// Module-level shared state (single source of truth for all useTheme callers)
// ---------------------------------------------------------------------------

type ThemeState = {
  theme: Theme;
  colorScheme: ColorScheme;
};

let state: ThemeState = {
  theme: getLS<Theme>(CACHE_KEYS.theme, "system"),
  colorScheme: getLS<ColorScheme>(CACHE_KEYS.colorScheme, DEFAULT_COLOR_SCHEME),
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    l();
  }
}

function getSnapshot(): ThemeState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Actions (stable references — safe to use without useCallback)
// ---------------------------------------------------------------------------

function setTheme(next: Theme) {
  withDisabledAnimations(() => {
    state = { ...state, theme: next };
    setLS<Theme>(CACHE_KEYS.theme, next);
    applyModeToDOM(next);
    emit();
  });
}

function setColorScheme(next: ColorScheme) {
  withDisabledAnimations(() => {
    state = { ...state, colorScheme: next };
    setLS<ColorScheme>(CACHE_KEYS.colorScheme, next);
    applySchemeToDOM(next);
    emit();
  });
}

function resolveMode(): "light" | "dark" {
  if (state.theme === "light" || state.theme === "dark") {
    return state.theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function toggleTheme() {
  setTheme(resolveMode() === "light" ? "dark" : "light");
}

/** Apply a color scheme to the DOM without persisting. */
function previewScheme(scheme: string) {
  applySchemeToDOM(scheme);
}

/** Apply a light/dark mode to the DOM without persisting. */
function previewMode(mode: string) {
  applyModeToDOM(mode as Theme);
}

/** Restore the DOM to match the persisted (committed) state. */
function endPreview() {
  applySchemeToDOM(state.colorScheme);
  applyModeToDOM(state.theme);
}

// ---------------------------------------------------------------------------
// System-preference listener (module-level, runs once)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (state.theme === "system") {
        applyModeToDOM("system");
      }
    });
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/** @internal Re-read localStorage and reset module state. Only for tests. */
export function __resetThemeState() {
  state = {
    theme: getLS<Theme>(CACHE_KEYS.theme, "system"),
    colorScheme: getLS<ColorScheme>(
      CACHE_KEYS.colorScheme,
      DEFAULT_COLOR_SCHEME
    ),
  };
  emit();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme() {
  const { theme, colorScheme } = useSyncExternalStore(subscribe, getSnapshot);

  return {
    theme,
    colorScheme,
    setTheme,
    setColorScheme,
    toggleTheme,
    previewScheme,
    previewMode,
    endPreview,
  };
}
