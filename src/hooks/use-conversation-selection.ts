import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useCallback, useMemo, useState } from "react";
import { usePersistentConvexQuery } from "./use-persistent-convex-query";

type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

type ConversationSummaryResponse = {
  conversations: ConversationSummary[];
  totalCount: number;
};

export function useConversationSelection() {
  const [selectedConversations, setSelectedConversations] = useState<
    Set<Id<"conversations">>
  >(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [includeAttachments, setIncludeAttachments] = useState(false);

  const conversationData =
    usePersistentConvexQuery<ConversationSummaryResponse | null>(
      "conversation-list",
      api.conversations.getConversationsSummaryForExport,
      {
        includeArchived: true,
        includePinned: true,
        limit: 1000,
      }
    );

  const conversations: ConversationSummary[] = useMemo(() => {
    return conversationData?.conversations ?? [];
  }, [conversationData]);

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
              newSelected.add(conversations[i]._id);
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
    if (conversations.length === 0) {
      return;
    }

    const allSelected = conversations.every((conv: ConversationSummary) =>
      selectedConversations.has(conv._id)
    );

    if (allSelected) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(
        new Set(conversations.map((conv: ConversationSummary) => conv._id))
      );
    }
  }, [conversations, selectedConversations]);

  const handleBulkSelect = useCallback(
    (conversationIds: Id<"conversations">[]) => {
      if (conversationIds.length === 0) {
        return;
      }

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
    conversations,
    selectedConversations,
    includeAttachments,
    isLoading: conversationData === undefined,
    handleConversationSelect,
    handleSelectAll,
    handleBulkSelect,
    setIncludeAttachments,
    clearSelection: () => setSelectedConversations(new Set()),
  };
}
