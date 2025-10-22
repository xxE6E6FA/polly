import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
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

  return (
    <ConversationListContent
      conversations={conversations}
      currentConversationId={currentConversationId}
      isLoading={isLoading}
      searchQuery={searchQuery}
    />
  );
};
