import { api } from "convex/_generated/api";
import type { Doc } from "convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { useConvexWithCache } from "@/hooks/use-convex-cache";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { useUser } from "@/hooks/use-user";
import {
  getStoredAnonymousUserId,
  onStoredUserIdChange,
} from "@/lib/auth-utils";
import { createLocalStorageCache } from "@/lib/localStorage-utils";
import type { ConversationId } from "@/types";

import { ConversationListContent } from "./conversation-list-content";

type ConversationListProps = {
  searchQuery: string;
  currentConversationId?: ConversationId;
};

const CACHE_VERSION = 1;
const MAX_CACHED_CONVERSATIONS = 50;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Create conversation cache instance
const conversationsCache = createLocalStorageCache<Doc<"conversations">[]>({
  key: "polly_conversations_cache",
  version: CACHE_VERSION,
  expiryMs: CACHE_EXPIRY,
  transform: {
    serialize: conversations => {
      // Apply business logic during serialization
      return [...conversations]
        .filter(conv => !conv.isArchived)
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) {
            return -1;
          }
          if (!a.isPinned && b.isPinned) {
            return 1;
          }
          return b.updatedAt - a.updatedAt;
        })
        .slice(0, MAX_CACHED_CONVERSATIONS);
    },
    deserialize: data => data as Doc<"conversations">[],
  },
});

function getCachedConversationsData(): Doc<"conversations">[] | null {
  return conversationsCache.get();
}

function setCachedConversationsData(conversations: Doc<"conversations">[]) {
  conversationsCache.set(conversations);
}

function clearCachedConversationsData() {
  conversationsCache.clear();
}

export const ConversationList = ({
  searchQuery,
  currentConversationId,
}: ConversationListProps) => {
  const { user } = useUser();
  const queryUserId = useQueryUserId();

  // Check if there's any stored user ID (anonymous or authenticated)
  const [hasStoredUserId, setHasStoredUserId] = useState(() => {
    return Boolean(getStoredAnonymousUserId());
  });

  // Listen for storage changes and custom events to update hasStoredUserId
  useEffect(() => {
    return onStoredUserIdChange(setHasStoredUserId);
  }, []);

  // Use the consolidated caching system for conversations
  const {
    data: conversations,
    isLoading: isLoadingConversations,
    invalidateCache: invalidateConversationsCache,
  } = useConvexWithCache(
    api.conversations.list,
    queryUserId ? { userId: queryUserId } : "skip",
    {
      queryKey: ["conversations", queryUserId || ""],
      getCachedData: getCachedConversationsData,
      setCachedData: setCachedConversationsData,
      clearCachedData: clearCachedConversationsData,
      invalidationEvents: ["conversations-changed", "user-graduated"],
      onCacheInvalidation: () => {
        // Additional cleanup if needed
      },
    }
  );

  // Use the consolidated caching system for current conversation
  useConvexWithCache(
    api.conversations.get,
    currentConversationId && queryUserId
      ? { id: currentConversationId }
      : "skip",
    {
      queryKey: ["conversation", currentConversationId || ""],
      getCachedData: () => null, // Don't cache individual conversations here
      setCachedData: () => {
        // No-op for individual conversation caching
      },
      clearCachedData: () => {
        // No-op for individual conversation caching
      },
      invalidationEvents: ["conversation-updated"],
      onCacheInvalidation: () => {
        // When current conversation changes, invalidate the conversations list
        invalidateConversationsCache();
      },
    }
  );

  // Clear cache when user logs out
  useEffect(() => {
    if (!(user || hasStoredUserId)) {
      clearCachedConversationsData();
    }
  }, [user, hasStoredUserId]);

  // Determine what data to display
  const conversationsToDisplay = Array.isArray(conversations)
    ? conversations
    : [];

  // Show skeleton only if we have no data at all and are loading
  const showSkeleton =
    Boolean(queryUserId) &&
    Boolean(user) &&
    isLoadingConversations &&
    conversationsToDisplay.length === 0;

  return (
    <ConversationListContent
      conversations={conversationsToDisplay}
      currentConversationId={currentConversationId}
      isLoading={showSkeleton}
      searchQuery={searchQuery}
    />
  );
};
