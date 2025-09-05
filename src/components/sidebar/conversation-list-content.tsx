import type { Doc } from "@convex/_generated/dataModel";
import { ChatCircleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { ConversationId } from "@/types";
import { ConversationGroup } from "./conversation-group";
import { ConversationItem } from "./conversation-item";

type ConversationListContentProps = {
  conversations: Doc<"conversations">[] | undefined;
  searchQuery: string;
  currentConversationId?: ConversationId;
  isLoading?: boolean;
};

export const ConversationListContent = ({
  conversations,
  searchQuery,
  currentConversationId,
  isLoading = false,
}: ConversationListContentProps) => {
  const groupedConversations = useMemo(() => {
    if (!conversations) {
      return {
        pinned: [],
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: [],
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const groups = {
      pinned: [] as typeof conversations,
      today: [] as typeof conversations,
      yesterday: [] as typeof conversations,
      lastWeek: [] as typeof conversations,
      lastMonth: [] as typeof conversations,
      older: [] as typeof conversations,
    };

    // Separate pinned and unpinned conversations
    const pinnedConversations = conversations.filter(c => c.isPinned);
    const unpinnedConversations = conversations.filter(c => !c.isPinned);

    // Sort pinned conversations by updatedAt (most recent first)
    groups.pinned = [...pinnedConversations].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Sort unpinned conversations by updatedAt (most recent first) and group them
    const sortedUnpinnedConversations = [...unpinnedConversations].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    for (const conversation of sortedUnpinnedConversations) {
      const conversationDate = new Date(conversation.updatedAt);
      const conversationDay = new Date(
        conversationDate.getFullYear(),
        conversationDate.getMonth(),
        conversationDate.getDate()
      );

      if (conversationDay.getTime() === today.getTime()) {
        groups.today.push(conversation);
      } else if (conversationDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(conversation);
      } else if (conversationDate.getTime() > lastWeek.getTime()) {
        groups.lastWeek.push(conversation);
      } else if (conversationDate.getTime() > lastMonth.getTime()) {
        groups.lastMonth.push(conversation);
      } else {
        groups.older.push(conversation);
      }
    }

    return groups;
  }, [conversations]);

  // Create ordered list of all visible conversation IDs for range selection
  const allVisibleIds = useMemo(() => {
    const ids: ConversationId[] = [];
    ids.push(...groupedConversations.pinned.map(c => c._id));
    ids.push(...groupedConversations.today.map(c => c._id));
    ids.push(...groupedConversations.yesterday.map(c => c._id));
    ids.push(...groupedConversations.lastWeek.map(c => c._id));
    ids.push(...groupedConversations.lastMonth.map(c => c._id));
    ids.push(...groupedConversations.older.map(c => c._id));
    return ids;
  }, [groupedConversations]);

  // Show skeleton when loading
  if (isLoading) {
    return <ConversationListSkeleton />;
  }

  // If no conversations and there's a search, show no results found
  if ((conversations?.length ?? 0) === 0 && searchQuery.trim().length > 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="stack-sm text-center">
          <ChatCircleIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No results found</p>
        </div>
      </div>
    );
  }

  // If no conversations and no search, just show empty div (no zero state)
  if ((conversations?.length ?? 0) === 0 && searchQuery.trim().length === 0) {
    return <div />;
  }

  return (
    <div className="pb-4">
      {groupedConversations.pinned.length > 0 && (
        <ConversationGroup title="Pinned">
          {groupedConversations.pinned.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}

      {groupedConversations.today.length > 0 && (
        <ConversationGroup title="Today">
          {groupedConversations.today.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}

      {groupedConversations.yesterday.length > 0 && (
        <ConversationGroup title="Yesterday">
          {groupedConversations.yesterday.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}

      {groupedConversations.lastWeek.length > 0 && (
        <ConversationGroup title="Last 7 days">
          {groupedConversations.lastWeek.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}

      {groupedConversations.lastMonth.length > 0 && (
        <ConversationGroup title="Last 30 days">
          {groupedConversations.lastMonth.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}

      {groupedConversations.older.length > 0 && (
        <ConversationGroup title="Older">
          {groupedConversations.older.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
              allVisibleIds={allVisibleIds}
            />
          ))}
        </ConversationGroup>
      )}
    </div>
  );
};

const ConversationListSkeleton = () => {
  return (
    <div className="pb-4">
      {/* Today section */}
      <div className="stack-sm">
        <div className="mb-1 h-4 w-12 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>

      {/* Yesterday section */}
      <div className="stack-sm">
        <div className="mb-1 h-4 w-20 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>
    </div>
  );
};

const ConversationItemSkeleton = () => {
  return <div className="h-8 animate-pulse rounded-lg bg-muted/40 px-3 py-2" />;
};
