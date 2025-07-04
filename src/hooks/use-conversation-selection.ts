import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useConversationSelection() {
  const [selectedConversations, setSelectedConversations] = useState<
    Set<Id<"conversations">>
  >(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [includeAttachments, setIncludeAttachments] = useState(false);

  const conversationData = useQuery(
    api.conversations.getConversationsSummaryForExport,
    {
      includeArchived: true,
      includePinned: true,
      limit: 1000,
    }
  );

  const conversations = useMemo(() => {
    return conversationData?.conversations || [];
  }, [conversationData?.conversations]);

  const handleConversationSelect = useCallback(
    (
      conversationId: Id<"conversations">,
      index: number,
      isShiftKey: boolean
    ) => {
      setSelectedConversations(prev => {
        const newSelected = new Set(prev);

        if (
          isShiftKey &&
          lastSelectedIndex !== null &&
          conversations.length > 0
        ) {
          const start = Math.min(lastSelectedIndex, index);
          const end = Math.max(lastSelectedIndex, index);

          for (let i = start; i <= end; i++) {
            if (i < conversations.length) {
              newSelected.add(conversations[i]._id as Id<"conversations">);
            }
          }
        } else if (newSelected.has(conversationId)) {
          newSelected.delete(conversationId);
        } else {
          newSelected.add(conversationId);
        }

        return newSelected;
      });

      setLastSelectedIndex(index);
    },
    [lastSelectedIndex, conversations]
  );

  const handleSelectAll = useCallback(() => {
    if (conversations.length === 0) return;

    const allSelected = conversations.every(conv =>
      selectedConversations.has(conv._id as Id<"conversations">)
    );

    if (allSelected) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(
        new Set(conversations.map(conv => conv._id as Id<"conversations">))
      );
    }
  }, [conversations, selectedConversations]);

  const handleBulkSelect = useCallback(
    (conversationIds: Id<"conversations">[]) => {
      if (conversationIds.length === 0) return;

      const allSelected = conversationIds.every(id =>
        selectedConversations.has(id)
      );

      if (allSelected) {
        setSelectedConversations(prev => {
          const newSelected = new Set(prev);
          conversationIds.forEach(id => newSelected.delete(id));
          return newSelected;
        });
      } else {
        setSelectedConversations(prev => {
          const newSelected = new Set(prev);
          conversationIds.forEach(id => newSelected.add(id));
          return newSelected;
        });
      }
    },
    [selectedConversations]
  );

  return {
    // Data
    conversations,
    selectedConversations,
    includeAttachments,
    isLoading: conversationData === undefined,

    // Actions
    handleConversationSelect,
    handleSelectAll,
    handleBulkSelect,
    setIncludeAttachments,
    clearSelection: () => setSelectedConversations(new Set()),
  };
}
