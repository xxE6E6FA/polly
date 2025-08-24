import { useCallback, useLayoutEffect, useRef } from "react";

interface UseTextareaHeightOptions {
  value: string;
  onHeightChange?: (isMultiline: boolean) => void;
  maxHeight?: number;
  minHeight?: number;
  debounceMs?: number;
}

export function useTextareaHeight({
  value,
  onHeightChange,
  maxHeight = 100,
  minHeight = 24,
  debounceMs = 16, // ~60fps
}: UseTextareaHeightOptions) {
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const lastValueRef = useRef(value);
  const lastHeightRef = useRef<number>(0);
  const lastMultilineRef = useRef<boolean>(false);

  const performResize = useCallback(
    (textarea: HTMLTextAreaElement) => {
      // Clear any pending timeouts/animations
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }

      textarea.style.height = "auto";
      // Force a reflow to get accurate scrollHeight
      textarea.offsetHeight;
      const currentHeight = textarea.scrollHeight;
      const newHeight = Math.min(currentHeight, maxHeight);

      // Only update if height actually changed
      if (newHeight !== lastHeightRef.current) {
        textarea.style.height = `${newHeight}px`;
        lastHeightRef.current = newHeight;
      }

      // Debounce multiline state changes to avoid excessive renders
      const isMultiline = value.trim().length > 0 && currentHeight > minHeight;
      if (isMultiline !== lastMultilineRef.current) {
        lastMultilineRef.current = isMultiline;

        if (debounceMs > 0) {
          resizeTimeoutRef.current = setTimeout(() => {
            onHeightChange?.(isMultiline);
          }, debounceMs);
        } else {
          onHeightChange?.(isMultiline);
        }
      }
    },
    [maxHeight, minHeight, value, onHeightChange, debounceMs]
  );

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      if (!textarea) {
        return;
      }

      // Use requestAnimationFrame for smooth 60fps resize
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }

      resizeRafRef.current = requestAnimationFrame(() => {
        performResize(textarea);
      });
    },
    [performResize]
  );

  // Handle value changes with debouncing
  useLayoutEffect(() => {
    // Only resize if value actually changed
    if (lastValueRef.current === value) {
      return;
    }
    lastValueRef.current = value;

    // For empty input, immediately update to single line to prevent flickering
    if (value.trim().length === 0 && lastMultilineRef.current) {
      lastMultilineRef.current = false;
      onHeightChange?.(false);
    }

    // Cleanup on unmount or value change
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, [value, onHeightChange]);

  // Cleanup on unmount
  useLayoutEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  return {
    resizeTextarea,
    lastHeight: lastHeightRef.current,
  };
}
