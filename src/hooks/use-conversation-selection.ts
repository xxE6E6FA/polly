import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useListSelection } from "@/hooks/use-list-selection";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

export type ConversationSummary = {
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

/**
 * Hook for managing conversation selection with data fetching
 * Uses useListSelection internally for selection state management
 */
export function useConversationSelection() {
  const [includeAttachments, setIncludeAttachments] = useState(true);

  // Data fetching
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

  // Use the generic list selection hook with shift+click support
  const listSelection = useListSelection<ConversationSummary>(
    conv => conv._id,
    { enableShiftSelect: true }
  );

  // Convert Set<string> to Set<Id<"conversations">> for type compatibility
  const selectedConversations = useMemo(() => {
    return listSelection.selectedKeys as Set<Id<"conversations">>;
  }, [listSelection.selectedKeys]);

  // Wrap toggleItemWithShift to match the existing API signature
  const handleConversationSelect = useCallback(
    (
      conversationId: Id<"conversations">,
      index: number,
      isShiftKey: boolean
    ) => {
      const conversation = conversations.find(c => c._id === conversationId);
      if (conversation) {
        listSelection.toggleItemWithShift(
          conversation,
          index,
          isShiftKey,
          conversations
        );
      }
    },
    [conversations, listSelection]
  );

  const onSelectAll = useCallback(() => {
    listSelection.toggleAll(conversations);
  }, [conversations, listSelection]);

  const onIncludeAttachmentsChange = useCallback((include: boolean) => {
    setIncludeAttachments(include);
  }, []);

  const totalConversations = conversations.length;
  const visibleConversations = conversations.length;
  const allSelected = listSelection.isAllSelected(conversations);
  const someSelected = listSelection.selectedCount > 0;

  return {
    // Selection state
    selectedConversations,
    handleConversationSelect,
    clearSelection: listSelection.clearSelection,
    onSelectAll,
    // Attachment options
    includeAttachments,
    onIncludeAttachmentsChange,
    // Data
    conversations,
    totalConversations,
    visibleConversations,
    // Selection status
    allSelected,
    someSelected,
    // Expose listSelection for DataList integration
    listSelection,
  };
}
