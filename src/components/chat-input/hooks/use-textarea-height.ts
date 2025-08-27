import { useCallback, useLayoutEffect, useRef } from "react";

interface UseTextareaHeightOptions {
  value: string;
  onHeightChange?: (isMultiline: boolean) => void;
}

// Simple autogrow: expand up to 5 lines, then scroll
export function useTextareaHeight({
  value,
  onHeightChange,
}: UseTextareaHeightOptions) {
  const lastReportedMultiline = useRef<boolean>(false);

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      if (!textarea) {
        return;
      }

      // Reset height to measure natural content height
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

      // Apply constraints
      textarea.style.minHeight = `${minH}px`;
      textarea.style.maxHeight = `${maxH}px`;

      const contentHeight = textarea.scrollHeight; // includes padding
      const newHeight = Math.max(minH, Math.min(contentHeight, maxH));
      textarea.style.height = `${newHeight}px`;

      // Toggle scroll when exceeding 5 lines
      const shouldScroll = contentHeight > maxH + 1; // tolerance
      textarea.style.overflowY = shouldScroll ? "auto" : "hidden";

      // Report multiline when content exceeds one line
      const isMultiline = contentHeight > minH + 1;
      if (isMultiline !== lastReportedMultiline.current) {
        lastReportedMultiline.current = isMultiline;
        onHeightChange?.(isMultiline);
      }
    },
    [onHeightChange]
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
