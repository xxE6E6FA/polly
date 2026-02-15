import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { memo, useEffect, useMemo } from "react";
import {
  getCachedConversations,
  setCachedConversations,
} from "@/lib/conversations-cache";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId, ConversationSearchResult } from "@/types";
import { ConversationListContent } from "./conversation-list-content";
import { SearchResultsContent } from "./search-results-content";

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

    const isSearching = searchQuery.trim().length > 0;

    // Search with matches query (for searching)
    const searchWithMatchesArg = (() => {
      if (!user || shouldSkipQuery || !isSearching) {
        return "skip";
      }
      return {
        searchQuery,
        includeArchived: false,
        limit: 20,
        maxMatchesPerConversation: 5,
      };
    })();

    const searchResults = useQuery(
      api.conversations.searchWithMatches,
      searchWithMatchesArg
    ) as ConversationSearchResult[] | undefined;

    // List query (for non-searching)
    const listArg = (() => {
      if (!user || shouldSkipQuery || isSearching) {
        return "skip";
      }
      return {
        includeArchived: false,
      };
    })();

    const conversationDataRaw = useQuery(api.conversations.list, listArg);

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
      if (isSearching) {
        return searchResults === undefined;
      }
      const hasConversations = conversations && conversations.length > 0;
      return conversationDataRaw === undefined && !hasConversations;
    }, [
      conversationDataRaw,
      conversations,
      userId,
      isSearching,
      searchResults,
    ]);

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

    if (isSearching) {
      return (
        <SearchResultsContent
          results={searchResults}
          searchQuery={searchQuery}
          isLoading={isLoading}
          isMobile={isMobile}
          onCloseSidebar={onCloseSidebar}
        />
      );
    }

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
