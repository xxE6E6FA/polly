import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useRef } from "react";
import { useActiveProfile } from "@/hooks/use-active-profile";
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

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

const slideTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 40,
  mass: 0.8,
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
    const { activeProfile, profiles } = useActiveProfile();
    const userId = user?._id ? String(user._id) : undefined;

    const hasMultipleProfiles = (profiles?.length ?? 0) >= 2;

    // Only pass profileId when user has multiple profiles
    const activeProfileId = hasMultipleProfiles
      ? activeProfile?._id
      : undefined;

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
        profileId: activeProfileId,
        includeUnassigned: activeProfileId
          ? (activeProfile?.isDefault ?? false)
          : undefined,
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
        profileId: activeProfileId,
        includeUnassigned: activeProfileId
          ? (activeProfile?.isDefault ?? false)
          : undefined,
      };
    })();

    const conversationDataRaw = useQuery(api.conversations.list, listArg);

    // Keep the last fresh result so we don't flash stale localStorage data
    // when the Convex query temporarily returns undefined during auth
    // transitions (e.g., StrictMode remount or session token refresh).
    // Clear when profile changes so we don't show the wrong profile's data.
    const lastFreshRef = useRef<Doc<"conversations">[] | null>(null);
    const lastProfileRef = useRef(activeProfileId);
    if (activeProfileId !== lastProfileRef.current) {
      lastFreshRef.current = null;
      lastProfileRef.current = activeProfileId;
    }
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

      return getCachedConversations(userId, activeProfileId);
    }, [conversationDataRaw, userId, activeProfileId]);

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
        setCachedConversations(userId, conversations, activeProfileId);
      }
    }, [conversations, searchQuery, userId, activeProfileId]);

    // Track slide direction for profile switch animation
    const directionRef = useRef(0);
    const prevActiveIndexRef = useRef(0);
    if (hasMultipleProfiles && profiles && activeProfile) {
      const newIndex = profiles.findIndex(p => p._id === activeProfile._id);
      if (newIndex !== -1 && newIndex !== prevActiveIndexRef.current) {
        directionRef.current = newIndex > prevActiveIndexRef.current ? 1 : -1;
        prevActiveIndexRef.current = newIndex;
      }
    }

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

    // When user has multiple profiles, animate slide transitions
    if (hasMultipleProfiles) {
      return (
        <div className="overflow-hidden">
          <AnimatePresence
            mode="popLayout"
            initial={false}
            custom={directionRef.current}
          >
            <motion.div
              key={activeProfile?._id ?? "default"}
              custom={directionRef.current}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
            >
              <ConversationListContent
                conversations={conversations}
                currentConversationId={currentConversationId}
                isLoading={isLoading}
                searchQuery={searchQuery}
                isMobile={isMobile}
                onCloseSidebar={onCloseSidebar}
              />
            </motion.div>
          </AnimatePresence>
        </div>
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
