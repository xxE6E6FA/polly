import { useCallback, useEffect, useState } from "react";
import { useDebounceTimeout } from "./use-timeout-management";

type SelectionInfo = {
  text: string;
  wordCount: number;
  rect: DOMRect;
  isInAssistantMessage: boolean;
};

type UseTextSelectionReturn = {
  selection: SelectionInfo | null;
  addQuoteToInput: (onAddQuote: (quote: string) => void) => void;
  clearSelection: () => void;
  lockSelection: () => void;
  unlockSelection: () => void;
};

export function useTextSelection(): UseTextSelectionReturn {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const { debounce, clearDebounce } = useDebounceTimeout();

  const handleSelectionChange = useCallback(() => {
    // Clear existing timeout and set new one
    clearDebounce();

    // Small delay to let the selection settle
    debounce(() => {
      const windowSelection = window.getSelection();

      if (!windowSelection || windowSelection.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const range = windowSelection.getRangeAt(0);
      const text = windowSelection.toString().trim();

      if (!text) {
        setSelection(null);
        return;
      }

      // Count words (split by whitespace and filter empty strings)
      const words = text.split(/\s+/).filter(word => word.length > 0);
      const wordCount = words.length;

      // Only show for selections with more than one word
      if (wordCount <= 1) {
        setSelection(null);
        return;
      }

      // Check if selection is within an assistant message
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element);

      // Find the closest message container
      const messageContainer = element?.closest("[data-message-role]");
      const isInAssistantMessage =
        messageContainer?.getAttribute("data-message-role") === "assistant";

      if (!isInAssistantMessage) {
        setSelection(null);
        return;
      }

      // Get the bounding rect for positioning
      const rect = range.getBoundingClientRect();

      setSelection({
        text,
        wordCount,
        rect,
        isInAssistantMessage,
      });
    }, 100);
  }, [debounce, clearDebounce]);

  const clearSelection = useCallback(() => {
    if (isLocked) {
      return;
    } // Don't clear if locked
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [isLocked]);

  const lockSelection = useCallback(() => {
    setIsLocked(true);
  }, []);

  const unlockSelection = useCallback(() => {
    setIsLocked(false);
  }, []);

  const addQuoteToInput = useCallback(
    (onAddQuote: (quote: string) => void) => {
      if (!selection) {
        return;
      }

      // Format as markdown quote
      const quote = selection.text
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n");

      onAddQuote(quote);
      clearSelection();
    },
    [selection, clearSelection]
  );

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearDebounce();
    };
  }, [handleSelectionChange, clearDebounce]);

  // Clear selection when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selection &&
        !isLocked &&
        !(event.target as Element)?.closest(
          '[data-message-role="assistant"]'
        ) &&
        !(event.target as Element)?.closest("[data-conversation-starter]")
      ) {
        clearSelection();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [selection, isLocked, clearSelection]);

  return {
    selection,
    addQuoteToInput,
    clearSelection,
    lockSelection,
    unlockSelection,
  };
}
