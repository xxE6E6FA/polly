import { useCallback, useLayoutEffect, useRef } from "react";

interface UseTextareaHeightOptions {
  value: string;
  onHeightChange?: (isMultiline: boolean) => void;
  // When fullscreen, defer min/max height to CSS classes (vh)
  isFullscreen?: boolean;
}

// Simple autogrow: expand up to 5 lines, then scroll
export function useTextareaHeight({
  value,
  onHeightChange,
  isFullscreen = false,
}: UseTextareaHeightOptions) {
  const lastReportedMultiline = useRef<boolean>(false);

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      if (!textarea) {
        return;
      }

      // Always reset height to measure natural content height
      textarea.style.height = "auto";

      const cs = window.getComputedStyle(textarea);
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const verticalPadding = paddingTop + paddingBottom;

      // Determine line-height in px (fallback if 'normal')
      let lineHeight = parseFloat(cs.lineHeight);
      if (Number.isNaN(lineHeight)) {
        const fontSize = parseFloat(cs.fontSize) || 16;
        lineHeight = Math.round(fontSize * 1.2);
      }

      const minH = Math.ceil(lineHeight + verticalPadding); // 1 line
      const maxH = Math.ceil(lineHeight * 5 + verticalPadding); // 5 lines

      let contentHeight = textarea.scrollHeight; // includes padding

      if (isFullscreen) {
        // Defer min/max to CSS classes (e.g., min-h-[50vh] max-h-[85vh])
        // Remove inline constraints so classes can take effect
        textarea.style.minHeight = "";
        textarea.style.maxHeight = "";
        // Let the browser handle height based on CSS; ensure scrolling when needed
        textarea.style.overflowY = "auto";
      } else {
        // Apply inline constraints for auto-grow up to 5 lines
        textarea.style.minHeight = `${minH}px`;
        textarea.style.maxHeight = `${maxH}px`;
        const newHeight = Math.max(minH, Math.min(contentHeight, maxH));
        textarea.style.height = `${newHeight}px`;
        // Toggle scroll when exceeding 5 lines
        const shouldScroll = contentHeight > maxH + 1; // tolerance
        textarea.style.overflowY = shouldScroll ? "auto" : "hidden";
      }

      // Report multiline when content exceeds one line
      // Recompute contentHeight after potential style changes
      contentHeight = textarea.scrollHeight;
      const isMultiline = contentHeight > minH + 1;
      if (isMultiline !== lastReportedMultiline.current) {
        lastReportedMultiline.current = isMultiline;
        onHeightChange?.(isMultiline);
      }
    },
    [onHeightChange, isFullscreen]
  );

  // Reset multiline state when cleared
  useLayoutEffect(() => {
    if (value.trim().length === 0 && lastReportedMultiline.current) {
      lastReportedMultiline.current = false;
      onHeightChange?.(false);
    }
  }, [value, onHeightChange]);

  return { resizeTextarea };
}
