import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { memo, useEffect, useMemo } from "react";
import {
  getCachedConversations,
  setCachedConversations,
} from "@/lib/conversations-cache";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";
import { ConversationListContent } from "./conversation-list-content";

type ConversationListProps = {
  searchQuery: string;
  currentConversationId?: ConversationId;
  isMobile: boolean;
  onCloseSidebar: () => void;
};

export const ConversationList = memo(
  ({
    searchQuery,
    currentConversationId,
    isMobile,
    onCloseSidebar,
  }: ConversationListProps) => {
    const { user } = useUserDataContext();
    const { isSidebarVisible } = useUI();
    const userId = user?._id ? String(user._id) : undefined;

    // Skip query on mobile when sidebar is hidden to reduce initial load
    const shouldSkipQuery = isMobile && !isSidebarVisible;

    const conversationQueryArg = (() => {
      if (!user || shouldSkipQuery) {
        return "skip";
      }
      if (searchQuery.trim()) {
        return {
          searchQuery,
          includeArchived: false,
          limit: 100,
        };
      }
      return {
        includeArchived: false,
      };
    })();

    const conversationDataRaw = useQuery(
      searchQuery.trim() ? api.conversations.search : api.conversations.list,
      conversationQueryArg
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
        isMobile={isMobile}
        onCloseSidebar={onCloseSidebar}
      />
    );
  }
);
