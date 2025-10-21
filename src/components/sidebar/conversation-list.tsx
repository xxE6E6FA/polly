import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { useConversationPreload } from "@/hooks/use-conversation-preload";
import {
  getCachedConversations,
  setCachedConversations,
} from "@/lib/conversations-cache";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";
import { ConversationListContent } from "./conversation-list-content";

type ConversationListProps = {
  searchQuery: string;
  currentConversationId?: ConversationId;
};

export const ConversationList = ({
  searchQuery,
  currentConversationId,
}: ConversationListProps) => {
  const { user } = useUserDataContext();
  const { preloadConversation } = useConversationPreload();
  const userId = user?._id ? String(user._id) : undefined;

  const conversationDataRaw = useQuery(
    searchQuery.trim() ? api.conversations.search : api.conversations.list,
    user
      ? searchQuery.trim()
        ? {
            searchQuery,
            includeArchived: false,
            limit: 100,
          }
        : {
            includeArchived: false,
          }
      : "skip"
  );

  const conversations = useMemo(() => {
    if (Array.isArray(conversationDataRaw)) {
      return conversationDataRaw;
    }

    return getCachedConversations(userId);
  }, [conversationDataRaw, userId]);

  const isLoading = useMemo(() => {
    if (!userId) {
      return false;
    }
    const hasConversations = conversations && conversations.length > 0;
    return conversationDataRaw === undefined && !hasConversations;
  }, [conversationDataRaw, conversations, userId]);

  useEffect(() => {
    if (
      userId &&
      conversations &&
      conversations.length > 0 &&
      !searchQuery.trim()
    ) {
      setCachedConversations(userId, conversations);
    }
  }, [conversations, searchQuery, userId]);

  // Preload the most recent conversations for faster navigation
  useEffect(() => {
    if (conversations && conversations.length > 0 && !searchQuery.trim()) {
      // Preload the first 3 most recent conversations (excluding current one)
      const conversationsToPreload = conversations
        .filter(conv => conv._id !== currentConversationId)
        .slice(0, 3);

      conversationsToPreload.forEach(conversation => {
        // Use a timeout to spread out the preloading and not block the UI
        setTimeout(() => {
          preloadConversation(conversation._id);
        }, 100);
      });
    }
  }, [conversations, searchQuery, currentConversationId, preloadConversation]);

  return (
    <ConversationListContent
      conversations={conversations}
      currentConversationId={currentConversationId}
      isLoading={isLoading}
      searchQuery={searchQuery}
    />
  );
};
