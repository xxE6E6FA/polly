import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useMemo, useState } from "react";

interface UseMentionStateOptions {
  personas: Array<{
    _id: Id<"personas">;
    name: string;
    icon?: string;
  }>;
  selectedPersonaId: Id<"personas"> | null;
  hasExistingMessages: boolean;
}

export function useMentionState({
  personas,
  selectedPersonaId,
  hasExistingMessages,
}: UseMentionStateOptions) {
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const mentionItems = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) {
      return [
        { id: null, name: "Default", icon: "🤖" },
        ...personas.map(p => ({ id: p._id, name: p.name, icon: p.icon })),
      ];
    }

    const filtered = personas.filter(p => p.name.toLowerCase().includes(q));
    return [
      { id: null, name: "Default", icon: "🤖" },
      ...filtered.map(p => ({ id: p._id, name: p.name, icon: p.icon })),
    ];
  }, [mentionQuery, personas]);

  const currentPersona = useMemo(
    () =>
      selectedPersonaId
        ? personas.find(p => p._id === selectedPersonaId) || null
        : null,
    [personas, selectedPersonaId]
  );

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
    (direction: "up" | "down") => {
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
    [mentionOpen, mentionItems.length, mentionActiveIndex]
  );

  const handleMentionConfirm = useCallback(() => {
    if (!mentionOpen || mentionItems.length === 0) {
      return null;
    }

    const selectedItem = mentionItems[mentionActiveIndex];
    if (selectedItem) {
      // Return the persona ID, let keyboard navigation handle closing the dropdown
      return selectedItem.id;
    }
    return null;
  }, [mentionOpen, mentionItems, mentionActiveIndex]);

  const handleMentionCancel = useCallback(() => {
    if (!mentionOpen) {
      return false;
    }
    resetMentionState();
    return true;
  }, [mentionOpen, resetMentionState]);

  // Disable mentions in existing conversations or when persona is already selected
  const mentionsDisabled = hasExistingMessages || !!selectedPersonaId;

  return {
    mentionOpen,
    mentionQuery,
    mentionActiveIndex,
    mentionItems,
    currentPersona,
    mentionsDisabled,
    handleMentionStateChange,
    resetMentionState,
    handleMentionNavigate,
    handleMentionConfirm,
    handleMentionCancel,
  };
}
