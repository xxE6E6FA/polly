import { useEffect } from "react";

interface UseInitialHeightOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onHeightChange?: (isMultiline: boolean) => void;
}

export function useInitialHeight({
  textareaRef,
  value,
  onHeightChange,
}: UseInitialHeightOptions) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    // Small delay to ensure textarea is fully rendered
    const timer = setTimeout(() => {
      // Force initial height calculation for empty input
      if (value.trim().length === 0) {
        textarea.style.height = "auto";
        // Force a reflow to get accurate scrollHeight
        textarea.offsetHeight;
        const initialHeight = textarea.scrollHeight;
        const collapsedHeight = Math.min(initialHeight, 100);
        textarea.style.height = `${collapsedHeight}px`;
        // Always start collapsed for empty input
        onHeightChange?.(false);
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [onHeightChange, textareaRef, value]); // Only run on mount
}
