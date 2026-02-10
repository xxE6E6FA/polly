import type { Doc } from "@convex/_generated/dataModel";
import { ChatCircleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useUserSettings } from "@/hooks";
import type { ConversationId } from "@/types";
import { ConversationGroup } from "./conversation-group";
import { ConversationItem } from "./conversation-item";

// Date group keys for categorizing conversations
type DateGroupKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "last7Days"
  | "last14Days"
  | "last30Days"
  | "last60Days"
  | "last90Days"
  | "older";

type DateGroups = Record<DateGroupKey, Doc<"conversations">[]>;

// Labels for each group
const GROUP_LABELS: Record<DateGroupKey, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  last7Days: "Last 7 days",
  last14Days: "Last 14 days",
  last30Days: "Last 30 days",
  last60Days: "Last 60 days",
  last90Days: "Last 90 days",
  older: "Older",
};

// Get which groups to show based on auto-archive setting
const getActiveGroups = (autoArchiveDays: number): DateGroupKey[] => {
  const base: DateGroupKey[] = ["pinned", "today", "yesterday"];
  const dynamicGroups: DateGroupKey[] = [];

  if (autoArchiveDays >= 7) {
    dynamicGroups.push("last7Days");
  }
  if (autoArchiveDays >= 14) {
    dynamicGroups.push("last14Days");
  }
  if (autoArchiveDays >= 30) {
    dynamicGroups.push("last30Days");
  }
  if (autoArchiveDays >= 60) {
    dynamicGroups.push("last60Days");
  }
  if (autoArchiveDays >= 90) {
    dynamicGroups.push("last90Days");
  }

  return [...base, ...dynamicGroups, "older"];
};

type ConversationListContentProps = {
  conversations: Doc<"conversations">[] | undefined;
  searchQuery: string;
  currentConversationId?: ConversationId;
  isLoading?: boolean;
  isMobile: boolean;
  onCloseSidebar: () => void;
};

export const ConversationListContent = ({
  conversations,
  searchQuery,
  currentConversationId,
  isLoading = false,
  isMobile,
  onCloseSidebar,
}: ConversationListContentProps) => {
  const userSettings = useUserSettings();
  const autoArchiveDays = userSettings?.autoArchiveDays ?? 30;

  const groupedConversations = useMemo((): DateGroups => {
    const emptyGroups: DateGroups = {
      pinned: [],
      today: [],
      yesterday: [],
      last7Days: [],
      last14Days: [],
      last30Days: [],
      last60Days: [],
      last90Days: [],
      older: [],
    };

    if (!conversations) {
      return emptyGroups;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Calculate date boundaries for each period
    const msPerDay = 24 * 60 * 60 * 1000;
    const boundaries = {
      last7Days: new Date(today.getTime() - 7 * msPerDay),
      last14Days: new Date(today.getTime() - 14 * msPerDay),
      last30Days: new Date(today.getTime() - 30 * msPerDay),
      last60Days: new Date(today.getTime() - 60 * msPerDay),
      last90Days: new Date(today.getTime() - 90 * msPerDay),
    };

    const groups: DateGroups = { ...emptyGroups };

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
      } else if (conversationDate.getTime() > boundaries.last7Days.getTime()) {
        groups.last7Days.push(conversation);
      } else if (conversationDate.getTime() > boundaries.last14Days.getTime()) {
        groups.last14Days.push(conversation);
      } else if (conversationDate.getTime() > boundaries.last30Days.getTime()) {
        groups.last30Days.push(conversation);
      } else if (conversationDate.getTime() > boundaries.last60Days.getTime()) {
        groups.last60Days.push(conversation);
      } else if (conversationDate.getTime() > boundaries.last90Days.getTime()) {
        groups.last90Days.push(conversation);
      } else {
        groups.older.push(conversation);
      }
    }

    return groups;
  }, [conversations]);

  // Get which groups to display based on auto-archive setting
  const activeGroups = useMemo(
    () => getActiveGroups(autoArchiveDays),
    [autoArchiveDays]
  );

  // Create ordered list of all visible conversation IDs for range selection
  const allVisibleIds = useMemo(() => {
    const ids: ConversationId[] = [];
    for (const groupKey of activeGroups) {
      ids.push(...groupedConversations[groupKey].map(c => c._id));
    }
    return ids;
  }, [groupedConversations, activeGroups]);

  // Show skeleton when loading
  if (isLoading) {
    return (
      <div className="pt-3 pb-3">
        <ConversationListSkeleton />
      </div>
    );
  }

  // If no conversations and there's a search, show no results found
  if ((conversations?.length ?? 0) === 0 && searchQuery.trim().length > 0) {
    return (
      <div className="pt-3 pb-3">
        <div className="flex h-32 items-center justify-start pl-2">
          <div className="stack-sm">
            <ChatCircleIcon className="mb-2 size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No results found</p>
          </div>
        </div>
      </div>
    );
  }

  // If no conversations and no search, just show empty div (no zero state)
  if ((conversations?.length ?? 0) === 0 && searchQuery.trim().length === 0) {
    return <div />;
  }

  // Track visible group index for stagger animation offset
  let visibleGroupIndex = 0;

  return (
    <div className="pb-3 pt-3">
      {activeGroups.map(groupKey => {
        const groupConversations = groupedConversations[groupKey];
        if (groupConversations.length === 0) {
          return null;
        }

        const groupIndex = visibleGroupIndex++;

        return (
          <div
            key={groupKey}
            className="animate-list-item-in"
            style={{
              animationDelay: `${groupIndex * 50}ms`,
            }}
          >
            <ConversationGroup
              title={GROUP_LABELS[groupKey]}
              count={groupConversations.length}
              collapsible={groupKey !== "pinned"}
            >
              {groupConversations.map(conversation => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  currentConversationId={currentConversationId}
                  allVisibleIds={allVisibleIds}
                  isMobile={isMobile}
                  onCloseSidebar={onCloseSidebar}
                />
              ))}
            </ConversationGroup>
          </div>
        );
      })}
    </div>
  );
};

const ConversationListSkeleton = () => {
  return (
    <div data-testid="conversation-list-skeleton">
      {/* Today section */}
      <div className="stack-sm pl-2">
        <div className="mb-1 h-4 w-12 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>

      {/* Yesterday section */}
      <div className="stack-sm pl-2">
        <div className="mb-1 h-4 w-20 animate-pulse rounded bg-muted/60" />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
        <ConversationItemSkeleton />
      </div>
    </div>
  );
};

const ConversationItemSkeleton = () => {
  return <div className="h-8 animate-pulse rounded-lg bg-muted/40 px-2 py-2" />;
};
