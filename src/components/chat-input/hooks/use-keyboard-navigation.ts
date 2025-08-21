import { useCallback } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

interface UseKeyboardNavigationOptions {
  onHistoryNavigation?: () => boolean;
  onHistoryNavigationDown?: () => boolean;
  onMentionNavigate?: (direction: "up" | "down") => boolean;
  onMentionConfirm?: () => Id<"personas"> | null;
  onMentionCancel?: () => boolean;
  onPersonaClear?: () => void;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
  onSubmit: () => void;
}

export function useKeyboardNavigation({
  onHistoryNavigation,
  onHistoryNavigationDown,
  onMentionNavigate,
  onMentionConfirm,
  onMentionCancel,
  onPersonaClear,
  onPersonaSelect,
  onSubmit,
}: UseKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const personaId = onMentionConfirm?.();

        // Check for both null and undefined explicitly
        if (personaId !== null && personaId !== undefined && personaId !== "") {
          e.preventDefault();
          if (onPersonaSelect) {
            onPersonaSelect(personaId);

            // Close the mention dropdown after selection
            if (onMentionCancel) {
              onMentionCancel();
            }
          }
          return;
        }

        e.preventDefault();
        onSubmit();
      } else if (e.key === "ArrowUp" && onMentionNavigate) {
        const handled = onMentionNavigate?.("up") ?? false;
        if (handled) {
          e.preventDefault();
          return;
        }
      } else if (e.key === "ArrowDown" && onMentionNavigate) {
        const handled = onMentionNavigate?.("down") ?? false;
        if (handled) {
          e.preventDefault();
          return;
        }
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
      } else if (e.key === "Escape" && onMentionCancel) {
        const handled = onMentionCancel?.() ?? false;
        if (handled) {
          e.preventDefault();
        }
      } else if (e.key === "Backspace") {
        const textarea = e.target as HTMLTextAreaElement;
        if (textarea.value.length === 0) {
          if (onMentionCancel?.()) {
            e.preventDefault();
          } else if (onPersonaClear) {
            // If no mention to cancel, clear selected persona
            onPersonaClear();
            e.preventDefault();
          }
        }
      }
    },
    [
      onSubmit,
      onHistoryNavigation,
      onHistoryNavigationDown,
      onMentionNavigate,
      onMentionConfirm,
      onMentionCancel,
      onPersonaClear,
      onPersonaSelect,
    ]
  );

  return { handleKeyDown };
}
