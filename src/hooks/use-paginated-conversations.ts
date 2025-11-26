import type { Id } from "@convex/_generated/dataModel";
import { useMemo, useState } from "react";
import { useListSelection } from "@/hooks/use-list-selection";

export type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

interface UsePaginatedConversationsOptions {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

/**
 * Hook for managing conversation selection state.
 * Used in conjunction with VirtualizedDataList which handles data fetching.
 */
export function usePaginatedConversations(
  _options: UsePaginatedConversationsOptions = {}
) {
  // Selection state using useListSelection with shift+click support
  const listSelection = useListSelection<ConversationSummary>(
    conv => conv._id,
    { enableShiftSelect: true }
  );

  // Include attachments option for exports
  const [includeAttachments, setIncludeAttachments] = useState(true);

  // Convert Set<string> to Set<Id<"conversations">> for type compatibility
  const selectedConversations = useMemo(() => {
    return listSelection.selectedKeys as Set<Id<"conversations">>;
  }, [listSelection.selectedKeys]);

  return {
    // Selection
    listSelection,
    selectedConversations,
    selectedCount: listSelection.selectedCount,
    someSelected: listSelection.selectedCount > 0,

    // Options
    includeAttachments,
    setIncludeAttachments,

    // Helpers
    clearSelection: listSelection.clearSelection,
  };
}
