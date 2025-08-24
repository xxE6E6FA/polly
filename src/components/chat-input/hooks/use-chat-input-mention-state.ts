import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useState } from "react";

export function useChatInputMentionState() {
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const handleMentionStateChange = useCallback(
    (state: { open: boolean; query: string; activeIndex: number }) => {
      setMentionOpen(state.open);
      setMentionQuery(state.query);
      setMentionActiveIndex(state.activeIndex);
    },
    []
  );

  const resetMentionState = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionActiveIndex(0);
  }, []);

  const handleMentionNavigate = useCallback(
    (
      direction: "up" | "down",
      mentionItems: Array<{
        id: Id<"personas"> | null;
        name: string;
        icon?: string;
      }>
    ) => {
      if (!mentionOpen || mentionItems.length === 0) {
        return false;
      }

      let newIndex: number;
      if (direction === "up") {
        newIndex =
          mentionActiveIndex > 0
            ? mentionActiveIndex - 1
            : mentionItems.length - 1;
      } else {
        newIndex =
          mentionActiveIndex < mentionItems.length - 1
            ? mentionActiveIndex + 1
            : 0;
      }

      setMentionActiveIndex(newIndex);
      return true;
    },
    [mentionOpen, mentionActiveIndex]
  );

  const handleMentionConfirm = useCallback(
    (
      mentionItems: Array<{
        id: Id<"personas"> | null;
        name: string;
        icon?: string;
      }>
    ) => {
      if (!mentionOpen || mentionItems.length === 0) {
        return null;
      }

      const selectedItem = mentionItems[mentionActiveIndex];
      if (selectedItem) {
        return selectedItem.id;
      }
      return null;
    },
    [mentionOpen, mentionActiveIndex]
  );

  const handleMentionCancel = useCallback(() => {
    if (!mentionOpen) {
      return false;
    }
    resetMentionState();
    return true;
  }, [mentionOpen, resetMentionState]);

  return {
    mentionOpen,
    mentionQuery,
    mentionActiveIndex,
    handleMentionStateChange,
    resetMentionState,
    handleMentionNavigate,
    handleMentionConfirm,
    handleMentionCancel,
  };
}
