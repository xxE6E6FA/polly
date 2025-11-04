import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConversationId } from "@/types";

type BatchSelectionContextValue = {
  isSelectionMode: boolean;
  isShiftPressed: boolean;
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
  isSelectionMode: false,
  isShiftPressed: false,
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

// Separate hook to access selected IDs without putting the raw Set on the public context
// Removed specialized selected-IDs hook; use useBatchSelection().getSelectedIds when needed

// Lightweight context solely for the sidebar hover setter to avoid re-renders
const SidebarHoverSetterContext = React.createContext<
  (hovering: boolean) => void
>(() => {
  // Default no-op
});

export function useSidebarHoverSetter() {
  const setter = React.useContext(SidebarHoverSetterContext);
  if (!setter) {
    throw new Error(
      "useSidebarHoverSetter must be used within a BatchSelectionProvider"
    );
  }
  return setter;
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
    const isTextInput = (target: EventTarget | null): boolean => {
      if (target === null) {
        return false;
      }
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea") {
        return true;
      }
      return target.isContentEditable === true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        if (!isTextInput(event.target)) {
          setIsShiftPressed(true);
        }
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
  // Note: we only expose shift state to consumers to avoid list-wide rerenders
  // when the mouse moves across the sidebar. Hover state is kept internal.
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
      const lastId = conversationIds[conversationIds.length - 1];
      if (lastId) {
        setLastSelectedId(lastId);
      }
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

  // Throttle hover state updates to avoid sidebar-wide re-renders when moving the mouse
  const hoverThrottleRef = React.useRef<number | null>(null);
  const pendingHoverRef = React.useRef<boolean | null>(null);

  const flushHover = useCallback(() => {
    if (pendingHoverRef.current === null) {
      return;
    }
    setHoveringOverSidebar(pendingHoverRef.current);
    pendingHoverRef.current = null;
    hoverThrottleRef.current = null;
  }, []);

  const setHoveringOverSidebarCallback = useCallback(
    (hovering: boolean) => {
      pendingHoverRef.current = hovering;
      if (hoverThrottleRef.current == null) {
        hoverThrottleRef.current = window.setTimeout(flushHover, 50);
      }
    },
    [flushHover]
  );

  const value = useMemo(
    () => ({
      isSelectionMode,
      isShiftPressed,
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
      isSelectionMode,
      isShiftPressed,
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
    <SidebarHoverSetterContext.Provider value={setHoveringOverSidebarCallback}>
      <BatchSelectionContext.Provider value={value}>
        {children}
      </BatchSelectionContext.Provider>
    </SidebarHoverSetterContext.Provider>
  );
};
