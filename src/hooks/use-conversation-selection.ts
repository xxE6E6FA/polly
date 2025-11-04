import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

// Helper function to get initial conversations from local storage
export function getInitialConversations(): ConversationSummary[] {
  return get(CACHE_KEYS.conversations, []);
}

export function useConversationSelection() {
  const [selectedConversations, setSelectedConversations] = useState<
    Set<Id<"conversations">>
  >(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [includeAttachments, setIncludeAttachments] = useState(true);

  const conversationSummaryRaw = useQuery(api.conversations.list, {
    includeArchived: true,
  });

  const conversations: ConversationSummary[] = useMemo(() => {
    if (Array.isArray(conversationSummaryRaw)) {
      return conversationSummaryRaw.map(conv => ({
        _id: conv._id,
        _creationTime: conv._creationTime,
        title: conv.title,
        isArchived: conv.isArchived,
        isPinned: conv.isPinned,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }));
    }
    return get(CACHE_KEYS.conversations, []);
  }, [conversationSummaryRaw]);

  // Cache conversations in local storage when they change
  useEffect(() => {
    if (conversations.length > 0) {
      set(CACHE_KEYS.conversations, conversations);
    }
  }, [conversations]);

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
              const id = conversations[i]?._id;
              if (id) {
                newSelected.add(id);
              }
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

  const clearSelection = useCallback(() => {
    setSelectedConversations(new Set());
    setLastSelectedIndex(null);
  }, []);

  const onSelectAll = useCallback(() => {
    const allIds = new Set(conversations.map(conv => conv._id));
    setSelectedConversations(allIds);
    setLastSelectedIndex(conversations.length - 1);
  }, [conversations]);

  const onIncludeAttachmentsChange = useCallback((include: boolean) => {
    setIncludeAttachments(include);
  }, []);

  const totalConversations = conversations.length;
  const visibleConversations = conversations.length;

  const allSelected = useMemo(() => {
    return (
      conversations.length > 0 &&
      conversations.every(conv => selectedConversations.has(conv._id))
    );
  }, [conversations, selectedConversations]);

  const someSelected = selectedConversations.size > 0;

  return {
    selectedConversations,
    handleConversationSelect,
    clearSelection,
    onSelectAll,
    includeAttachments,
    onIncludeAttachmentsChange,
    conversations,
    totalConversations,
    visibleConversations,
    allSelected,
    someSelected,
  };
}
