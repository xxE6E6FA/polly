import { useCallback } from "react";

interface UseKeyboardNavigationOptions {
  onHistoryNavigation?: () => boolean;
  onHistoryNavigationDown?: () => boolean;
  onPersonaClear?: () => void;
  onSubmit: () => void;
}

export function useKeyboardNavigation({
  onHistoryNavigation,
  onHistoryNavigationDown,
  onPersonaClear,
  onSubmit,
}: UseKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      } else if (e.key === "ArrowUp" && onHistoryNavigation) {
        const textarea = e.target as HTMLTextAreaElement;
        if (textarea.selectionStart === 0) {
          const handled = onHistoryNavigation();
          if (handled) {
            e.preventDefault();
          }
        }
      } else if (e.key === "ArrowDown" && onHistoryNavigationDown) {
        const textarea = e.target as HTMLTextAreaElement;
        if (textarea.selectionStart === textarea.value.length) {
          const handled = onHistoryNavigationDown();
          if (handled) {
            e.preventDefault();
          }
        }
      } else if (e.key === "Backspace") {
        const textarea = e.target as HTMLTextAreaElement;
        if (textarea.value.length === 0 && onPersonaClear) {
          // Clear selected persona on backspace when input is empty
          onPersonaClear();
          e.preventDefault();
        }
      }
    },
    [onSubmit, onHistoryNavigation, onHistoryNavigationDown, onPersonaClear]
  );

  return { handleKeyDown };
}
