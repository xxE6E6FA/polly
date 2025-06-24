import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { ConversationListContent } from "./conversation-list-content";
import { useUser } from "@/hooks/use-user";
import { ConversationId } from "@/types";
import { api } from "convex/_generated/api";
import {
  getCachedConversations,
  setCachedConversations,
  clearConversationCache,
  updateCachedConversation,
} from "@/lib/conversation-cache";
import { Doc } from "convex/_generated/dataModel";
import {
  getStoredAnonymousUserId,
  onStoredUserIdChange,
} from "@/lib/auth-utils";

interface ConversationListProps {
  searchQuery: string;
  currentConversationId?: ConversationId;
}

export function ConversationList({
  searchQuery,
  currentConversationId,
}: ConversationListProps) {
  const { user } = useUser();

  // Check if there's any stored user ID (anonymous or authenticated)
  const [hasStoredUserId, setHasStoredUserId] = useState(() => {
    return !!getStoredAnonymousUserId();
  });

  // Listen for storage changes and custom events to update hasStoredUserId
  useEffect(() => {
    return onStoredUserIdChange(setHasStoredUserId);
  }, []);

  // Initialize with cached data immediately for instant rendering
  const [cachedConversations] = useState<Doc<"conversations">[] | null>(() => {
    if (typeof window !== "undefined") {
      return getCachedConversations();
    }
    return null;
  });

  // Determine the user ID to use for queries
  // Prefer the authenticated user ID, fall back to stored anonymous ID
  const queryUserId =
    user?._id || (hasStoredUserId ? getStoredAnonymousUserId() : null);

  // Only fetch conversations if we have a user ID (either from user object or storage)
  const conversations = useQuery(
    api.conversations.list,
    queryUserId ? { userId: queryUserId } : "skip"
  );

  // Get the current conversation if available to update cache when it changes
  const currentConversation = useQuery(
    api.conversations.get,
    currentConversationId && queryUserId
      ? { id: currentConversationId }
      : "skip"
  );

  useEffect(() => {
    if (!user && !hasStoredUserId) {
      clearConversationCache();
    }
  }, [user, hasStoredUserId]);

  // Update cache when conversations list changes
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      setCachedConversations(conversations);
    }
  }, [conversations]);

  // Update cache when current conversation changes (e.g., title update, new message)
  useEffect(() => {
    if (currentConversation) {
      updateCachedConversation(currentConversation);
    }
  }, [currentConversation]);

  // Determine what data to display
  const conversationsToDisplay = conversations || cachedConversations || [];

  // Check if we're loading fresh data
  const isLoadingFreshData =
    !!queryUserId && !!user && conversations === undefined;

  // Show skeleton only if we have no data at all (no cache and loading)
  const showSkeleton = isLoadingFreshData && !cachedConversations;

  return (
    <ConversationListContent
      conversations={conversationsToDisplay}
      searchQuery={searchQuery}
      currentConversationId={currentConversationId}
      isLoading={showSkeleton}
    />
  );
}
