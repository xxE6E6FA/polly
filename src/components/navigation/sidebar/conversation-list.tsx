import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { memo, useEffect, useMemo, useRef } from "react";
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
    const { isAuthenticated } = useConvexAuth();
    const { isSidebarVisible } = useUI();
    const userId = user?._id ? String(user._id) : undefined;

    // Skip query on mobile when sidebar is hidden to reduce initial load
    const shouldSkipQuery = isMobile && !isSidebarVisible;

    // Gate queries on isAuthenticated so they don't run before Convex has
    // a valid auth token. Without this, the server runs the query without
    // auth context → getAuthUserId() returns null → returns [] (empty array).
    // That empty array poisons lastFreshRef and causes a visible
    // cache → empty → server-data flicker.
    const shouldSkipAuth = !isAuthenticated;

    const isSearching = searchQuery.trim().length > 0;

    // Search with matches query (for searching)
    const searchWithMatchesArg = (() => {
      if (!user || shouldSkipAuth || shouldSkipQuery || !isSearching) {
        return "skip";
      }
      return {
        searchQuery,
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
      if (!user || shouldSkipAuth || shouldSkipQuery || isSearching) {
        return "skip";
      }
      return {
        includeArchived: false,
      };
    })();

    const conversationDataRaw = useQuery(api.conversations.list, listArg);

    // Keep the last fresh result so we don't flash stale localStorage data
    // when the Convex query temporarily returns undefined during auth
    // transitions (e.g., StrictMode remount or session token refresh).
    const lastFreshRef = useRef<Doc<"conversations">[] | null>(null);
    if (Array.isArray(conversationDataRaw)) {
      lastFreshRef.current = conversationDataRaw;
    }

    const conversations = useMemo(() => {
      if (Array.isArray(conversationDataRaw)) {
        return conversationDataRaw;
      }

      // Prefer the last fresh server result over stale localStorage cache
      // to avoid a loaded→empty→loaded flicker during auth transitions
      if (lastFreshRef.current) {
        return lastFreshRef.current;
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
