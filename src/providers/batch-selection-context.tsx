import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConversationId } from "@/types";

type BatchSelectionContextValue = {
  selectedConversationIds: Set<ConversationId>;
  isSelectionMode: boolean;
  isShiftPressed: boolean;
  isHoveringOverSidebar: boolean;
  setHoveringOverSidebar: (hovering: boolean) => void;
  toggleSelection: (conversationId: ConversationId) => void;
  selectConversation: (conversationId: ConversationId) => void;
  deselectConversation: (conversationId: ConversationId) => void;
  selectAllVisible: (conversationIds: ConversationId[]) => void;
  selectRange: (
    conversationId: ConversationId,
    allVisibleIds: ConversationId[]
  ) => void;
  clearSelection: () => void;
  isSelected: (conversationId: ConversationId) => boolean;
  hasSelection: boolean;
  selectionCount: number;
  getSelectedIds: () => ConversationId[];
  lastSelectedId: ConversationId | null;
  resetHoverStates: () => void;
};

type BatchSelectionProviderProps = {
  children: React.ReactNode;
};

const BatchSelectionContext = React.createContext<BatchSelectionContextValue>({
  selectedConversationIds: new Set(),
  isSelectionMode: false,
  isShiftPressed: false,
  isHoveringOverSidebar: false,
  setHoveringOverSidebar: () => {
    // Default no-op
  },
  toggleSelection: () => {
    // Default no-op
  },
  selectConversation: () => {
    // Default no-op
  },
  deselectConversation: () => {
    // Default no-op
  },
  selectAllVisible: () => {
    // Default no-op
  },
  selectRange: () => {
    // Default no-op
  },
  clearSelection: () => {
    // Default no-op
  },
  isSelected: () => false,
  hasSelection: false,
  selectionCount: 0,
  getSelectedIds: () => [],
  lastSelectedId: null,
  resetHoverStates: () => {
    // Default no-op
  },
});

export function useBatchSelection() {
  const context = React.useContext(BatchSelectionContext);
  if (!context) {
    throw new Error(
      "useBatchSelection must be used within a BatchSelectionProvider"
    );
  }
  return context;
}

export const BatchSelectionProvider = ({
  children,
}: BatchSelectionProviderProps) => {
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    Set<ConversationId>
  >(new Set());
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isHoveringOverSidebar, setHoveringOverSidebar] = useState(false);
  const [lastSelectedId, setLastSelectedId] = useState<ConversationId | null>(
    null
  );

  // Shift key detection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(true);
      } else if (event.key === "Escape") {
        // Clear selection when ESC is pressed
        setSelectedConversationIds(new Set());
        setLastSelectedId(null);
        setHoveringOverSidebar(false);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Clear selection when all items are deselected
  useEffect(() => {
    if (selectedConversationIds.size === 0) {
      setLastSelectedId(null);
    }
  }, [selectedConversationIds.size]);

  const isSelectionMode = isShiftPressed && isHoveringOverSidebar;
  const hasSelection = selectedConversationIds.size > 0;
  const selectionCount = selectedConversationIds.size;

  const toggleSelection = useCallback((conversationId: ConversationId) => {
    setSelectedConversationIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
        setLastSelectedId(conversationId);
      }
      return newSet;
    });
  }, []);

  const selectConversation = useCallback((conversationId: ConversationId) => {
    setSelectedConversationIds(prev => new Set(prev).add(conversationId));
    setLastSelectedId(conversationId);
  }, []);

  const deselectConversation = useCallback((conversationId: ConversationId) => {
    setSelectedConversationIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(conversationId);
      return newSet;
    });
  }, []);

  const selectAllVisible = useCallback((conversationIds: ConversationId[]) => {
    setSelectedConversationIds(new Set(conversationIds));
    if (conversationIds.length > 0) {
      setLastSelectedId(conversationIds[conversationIds.length - 1]);
    }
  }, []);

  const selectRange = useCallback(
    (conversationId: ConversationId, allVisibleIds: ConversationId[]) => {
      if (!lastSelectedId) {
        // If no previous selection, just select this one
        selectConversation(conversationId);
        return;
      }

      const lastIndex = allVisibleIds.indexOf(lastSelectedId);
      const currentIndex = allVisibleIds.indexOf(conversationId);

      if (lastIndex === -1 || currentIndex === -1) {
        // If either ID is not found, fallback to single selection
        selectConversation(conversationId);
        return;
      }

      // Select range between lastSelectedId and conversationId (inclusive)
      const startIndex = Math.min(lastIndex, currentIndex);
      const endIndex = Math.max(lastIndex, currentIndex);
      const rangeIds = allVisibleIds.slice(startIndex, endIndex + 1);

      setSelectedConversationIds(prev => {
        const newSet = new Set(prev);
        for (const id of rangeIds) {
          newSet.add(id);
        }
        return newSet;
      });
      setLastSelectedId(conversationId);
    },
    [lastSelectedId, selectConversation]
  );

  const clearSelection = useCallback(() => {
    setSelectedConversationIds(new Set());
    setLastSelectedId(null);
    setHoveringOverSidebar(false);
  }, []);

  const isSelected = useCallback(
    (conversationId: ConversationId) => {
      return selectedConversationIds.has(conversationId);
    },
    [selectedConversationIds]
  );

  const getSelectedIds = useCallback(() => {
    return Array.from(selectedConversationIds);
  }, [selectedConversationIds]);

  const resetHoverStates = useCallback(() => {
    setHoveringOverSidebar(false);
  }, []);

  const setHoveringOverSidebarCallback = useCallback(
    (hovering: boolean) => setHoveringOverSidebar(hovering),
    []
  );

  const value = useMemo(
    () => ({
      selectedConversationIds,
      isSelectionMode,
      isShiftPressed,
      isHoveringOverSidebar,
      setHoveringOverSidebar: setHoveringOverSidebarCallback,
      toggleSelection,
      selectConversation,
      deselectConversation,
      selectAllVisible,
      selectRange,
      clearSelection,
      isSelected,
      hasSelection,
      selectionCount,
      getSelectedIds,
      lastSelectedId,
      resetHoverStates,
    }),
    [
      selectedConversationIds,
      isSelectionMode,
      isShiftPressed,
      isHoveringOverSidebar,
      setHoveringOverSidebarCallback,
      toggleSelection,
      selectConversation,
      deselectConversation,
      selectAllVisible,
      selectRange,
      clearSelection,
      isSelected,
      hasSelection,
      selectionCount,
      getSelectedIds,
      lastSelectedId,
      resetHoverStates,
    ]
  );

  return (
    <BatchSelectionContext.Provider value={value}>
      {children}
    </BatchSelectionContext.Provider>
  );
};
