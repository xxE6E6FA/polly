import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CACHE_KEYS,
  get as getLocalStorage,
  set as setLocalStorage,
} from "@/lib/local-storage";

export const FONT_OPTIONS = [
  { label: "Serif", value: "serif" },
  { label: "Sans", value: "sans" },
] as const;

export const FONT_SIZE_STEPS = [0.92, 0.97, 1, 1.07, 1.14] as const;
export const LINE_HEIGHT_STEPS = [0.92, 1, 1.08, 1.16] as const;
export const WIDTH_CLASSES = [
  "max-w-2xl",
  "max-w-3xl",
  "max-w-4xl",
  "max-w-5xl",
] as const;

export type DisplaySettings = {
  fontFamily: (typeof FONT_OPTIONS)[number]["value"];
  fontSizeIndex: number;
  lineHeightIndex: number;
  widthIndex: number;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontFamily: "serif",
  fontSizeIndex: 2,
  lineHeightIndex: 1,
  widthIndex: 1,
};

const DISPLAY_STORAGE_KEY = CACHE_KEYS.zenDisplayPreferences;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const sanitizeDisplaySettings = (
  settings: Partial<DisplaySettings> | null
): DisplaySettings => {
  if (!settings) {
    return DEFAULT_DISPLAY_SETTINGS;
  }

  const fontFamily =
    settings.fontFamily &&
    FONT_OPTIONS.some(option => option.value === settings.fontFamily)
      ? settings.fontFamily
      : DEFAULT_DISPLAY_SETTINGS.fontFamily;

  const fontSizeIndex = clamp(
    settings.fontSizeIndex ?? DEFAULT_DISPLAY_SETTINGS.fontSizeIndex,
    0,
    FONT_SIZE_STEPS.length - 1
  );

  const lineHeightIndex = clamp(
    settings.lineHeightIndex ?? DEFAULT_DISPLAY_SETTINGS.lineHeightIndex,
    0,
    LINE_HEIGHT_STEPS.length - 1
  );

  const widthIndex = clamp(
    settings.widthIndex ?? DEFAULT_DISPLAY_SETTINGS.widthIndex,
    0,
    WIDTH_CLASSES.length - 1
  );

  return {
    fontFamily,
    fontSizeIndex,
    lineHeightIndex,
    widthIndex,
  } satisfies DisplaySettings;
};

export type ZenDisplaySettingsControls = {
  displaySettings: DisplaySettings;
  fontFamilyClass: string;
  trackingClass: string;
  widthClass: (typeof WIDTH_CLASSES)[number];
  zenTypographyStyle: CSSProperties;
  updateFontFamily: (value: DisplaySettings["fontFamily"]) => void;
  adjustFontSize: (delta: number) => void;
  adjustLineHeight: (delta: number) => void;
  adjustWidth: (delta: number) => void;
  isFontAtMin: boolean;
  isFontAtMax: boolean;
  isLineAtMin: boolean;
  isLineAtMax: boolean;
  isWidthAtMin: boolean;
  isWidthAtMax: boolean;
};

export const useZenDisplaySettings = (): ZenDisplaySettingsControls => {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS
  );
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    const stored = getLocalStorage(
      DISPLAY_STORAGE_KEY,
      null as DisplaySettings | null
    );
    if (stored) {
      setDisplaySettings(sanitizeDisplaySettings(stored));
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    setLocalStorage(DISPLAY_STORAGE_KEY, displaySettings);
  }, [displaySettings]);

  const updateFontFamily = useCallback(
    (value: DisplaySettings["fontFamily"]) => {
      setDisplaySettings(prev => {
        if (prev.fontFamily === value) {
          return prev;
        }
        return { ...prev, fontFamily: value };
      });
    },
    []
  );

  const adjustFontSize = useCallback((delta: number) => {
    setDisplaySettings(prev => {
      const nextIndex = clamp(
        prev.fontSizeIndex + delta,
        0,
        FONT_SIZE_STEPS.length - 1
      );
      if (nextIndex === prev.fontSizeIndex) {
        return prev;
      }
      return { ...prev, fontSizeIndex: nextIndex };
    });
  }, []);

  const adjustLineHeight = useCallback((delta: number) => {
    setDisplaySettings(prev => {
      const nextIndex = clamp(
        prev.lineHeightIndex + delta,
        0,
        LINE_HEIGHT_STEPS.length - 1
      );
      if (nextIndex === prev.lineHeightIndex) {
        return prev;
      }
      return { ...prev, lineHeightIndex: nextIndex };
    });
  }, []);

  const adjustWidth = useCallback((delta: number) => {
    setDisplaySettings(prev => {
      const nextIndex = clamp(
        prev.widthIndex + delta,
        0,
        WIDTH_CLASSES.length - 1
      );
      if (nextIndex === prev.widthIndex) {
        return prev;
      }
      return { ...prev, widthIndex: nextIndex };
    });
  }, []);

  const fontFamilyClass =
    displaySettings.fontFamily === "serif" ? "font-serif" : "font-sans";
  const trackingClass =
    displaySettings.fontFamily === "serif"
      ? "tracking-[0.001em]"
      : "tracking-[0.015em]";

  const widthClass = WIDTH_CLASSES[displaySettings.widthIndex];

  const fontScale = FONT_SIZE_STEPS[displaySettings.fontSizeIndex];
  const lineScale = LINE_HEIGHT_STEPS[displaySettings.lineHeightIndex];

  const zenTypographyStyle = useMemo<CSSProperties>(() => {
    return {
      "--zen-font-scale": fontScale,
      "--zen-line-scale": lineScale,
    } as CSSProperties;
  }, [fontScale, lineScale]);

  const isFontAtMin = displaySettings.fontSizeIndex === 0;
  const isFontAtMax =
    displaySettings.fontSizeIndex === FONT_SIZE_STEPS.length - 1;
  const isLineAtMin = displaySettings.lineHeightIndex === 0;
  const isLineAtMax =
    displaySettings.lineHeightIndex === LINE_HEIGHT_STEPS.length - 1;
  const isWidthAtMin = displaySettings.widthIndex === 0;
  const isWidthAtMax = displaySettings.widthIndex === WIDTH_CLASSES.length - 1;

  return {
    displaySettings,
    fontFamilyClass,
    trackingClass,
    widthClass,
    zenTypographyStyle,
    updateFontFamily,
    adjustFontSize,
    adjustLineHeight,
    adjustWidth,
    isFontAtMin,
    isFontAtMax,
    isLineAtMin,
    isLineAtMax,
    isWidthAtMin,
    isWidthAtMax,
  } satisfies ZenDisplaySettingsControls;
};
