import { useCallback, useLayoutEffect, useRef } from "react";

interface UseTextareaHeightOptions {
  value: string;
  onHeightChange?: (isMultiline: boolean) => void;
  maxHeight?: number;
  minHeight?: number;
}

export function useTextareaHeight({
  value,
  onHeightChange,
  maxHeight = 100,
  minHeight = 24,
}: UseTextareaHeightOptions) {
  const resizeRafRef = useRef<number | null>(null);
  const lastValueRef = useRef(value);
  const lastHeightRef = useRef<number>(0);

  const performResize = useCallback(
    (textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      // Force a reflow to get accurate scrollHeight
      textarea.offsetHeight;
      const currentHeight = textarea.scrollHeight;
      const newHeight = Math.min(currentHeight, maxHeight);

      // Only update if height actually changed
      if (newHeight !== lastHeightRef.current) {
        textarea.style.height = `${newHeight}px`;
        lastHeightRef.current = newHeight;
        // For empty input, always treat as single line (collapsed)
        const isMultiline =
          value.trim().length > 0 && currentHeight > minHeight;
        onHeightChange?.(isMultiline);
      }

      resizeRafRef.current = null;
    },
    [maxHeight, minHeight, value, onHeightChange]
  );

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      if (!textarea) {
        return;
      }

      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }

      // Use requestAnimationFrame for smooth 60fps resize
      resizeRafRef.current = requestAnimationFrame(() => {
        performResize(textarea);
      });
    },
    [performResize]
  );

  // Handle value changes
  useLayoutEffect(() => {
    // Only resize if value actually changed
    if (lastValueRef.current === value) {
      return;
    }
    lastValueRef.current = value;

    // Cancel any pending resize
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
    }

    // Use requestAnimationFrame for smooth 60fps resize
    resizeRafRef.current = requestAnimationFrame(() => {
      // This will be handled by the resizeTextarea function
    });

    // Cleanup animation frame
    return () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, [value]);

  // Ensure initial height is set correctly
  useLayoutEffect(() => {
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
    }

    // Ensure initial height is set correctly
    if (value.trim().length === 0) {
      // Always start collapsed for empty input
      onHeightChange?.(false);
    } else {
      resizeRafRef.current = requestAnimationFrame(() => {
        // This will be handled by the resizeTextarea function
      });
    }

    return () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, [value, onHeightChange]);

  return {
    resizeTextarea,
    lastHeight: lastHeightRef.current,
  };
}
