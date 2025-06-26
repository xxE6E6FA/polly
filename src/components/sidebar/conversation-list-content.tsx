import { useMemo } from "react";

import { ChatCircleIcon } from "@phosphor-icons/react";

import { useConversationSearch } from "@/hooks/use-conversation-search";
import { type ConversationId } from "@/types";

import { ConversationGroup } from "./conversation-group";
import { ConversationItem } from "./conversation-item";
import { type Doc } from "../../../convex/_generated/dataModel";

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
  const filteredConversations = useConversationSearch(
    conversations || [],
    searchQuery
  );

  const groupedConversations = useMemo(() => {
    if (!conversations) {
      return {
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
      today: [] as typeof conversations,
      yesterday: [] as typeof conversations,
      lastWeek: [] as typeof conversations,
      lastMonth: [] as typeof conversations,
      older: [] as typeof conversations,
    };

    // Sort conversations by updatedAt (most recent first)
    const sortedConversations = [...filteredConversations].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    for (const conversation of sortedConversations) {
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
      } else if (
        conversationDay.getTime() > yesterday.getTime() &&
        conversationDay.getTime() <= lastWeek.getTime()
      ) {
        groups.lastWeek.push(conversation);
      } else if (
        conversationDay.getTime() > lastWeek.getTime() &&
        conversationDay.getTime() <= lastMonth.getTime()
      ) {
        groups.lastMonth.push(conversation);
      } else {
        groups.older.push(conversation);
      }
    }

    return groups;
  }, [conversations, filteredConversations]);

  // Show skeleton when loading
  if (isLoading) {
    return <ConversationListSkeleton />;
  }

  // If no conversations and there's a search, show no results found
  if (filteredConversations.length === 0 && searchQuery.trim().length > 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="space-y-1 text-center">
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
    <div className="space-y-4 pb-4">
      {groupedConversations.today.length > 0 && (
        <ConversationGroup title="Today">
          {groupedConversations.today.map(conversation => (
            <ConversationItem
              key={conversation._id}
              conversation={conversation}
              currentConversationId={currentConversationId}
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
            />
          ))}
        </ConversationGroup>
      )}
    </div>
  );
};

const ConversationListSkeleton = () => {
  return (
    <div className="space-y-4 pb-4">
      {/* Today section */}
      <div className="space-y-1">
        <div className="mx-3 mb-1 h-4 w-12 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>

      {/* Yesterday section */}
      <div className="space-y-1">
        <div className="mx-3 mb-1 h-4 w-20 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>
    </div>
  );
};

const ConversationItemSkeleton = () => {
  return (
    <div className="mx-1 h-8 animate-pulse rounded-lg bg-muted/40 px-3 py-2" />
  );
};
