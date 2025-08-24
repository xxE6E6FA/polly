import { useCallback, useState } from "react";

export function useChatInputHistory() {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");

  const handleHistoryNavigation = useCallback(
    (
      userMessages: string[],
      currentInput: string,
      setInput: (value: string) => void
    ) => {
      if (userMessages.length === 0) {
        return false;
      }

      if (historyIndex === -1) {
        setOriginalInput(currentInput);
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex < userMessages.length) {
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);
        return true;
      }

      return false;
    },
    [historyIndex]
  );

  const handleHistoryNavigationDown = useCallback(
    (userMessages: string[], setInput: (value: string) => void) => {
      if (historyIndex <= -1) {
        return false;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex === -1) {
        // Return to original input
        setHistoryIndex(-1);
        setInput(originalInput);
        return true;
      }

      if (nextIndex >= 0) {
        // Navigate to newer message in history
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);
        return true;
      }

      return false;
    },
    [historyIndex, originalInput]
  );

  const handleInputChange = useCallback(
    (
      value: string,
      userMessages: string[],
      setInput: (value: string) => void
    ) => {
      if (historyIndex !== -1 && value !== userMessages[historyIndex]) {
        setHistoryIndex(-1);
        setOriginalInput("");
      }
      setInput(value);
    },
    [historyIndex]
  );

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalInput("");
  }, []);

  return {
    historyIndex,
    originalInput,
    handleHistoryNavigation,
    handleHistoryNavigationDown,
    handleInputChange,
    resetHistory,
  };
}
