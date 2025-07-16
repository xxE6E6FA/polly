import { api } from "convex/_generated/api";
import { useEffect, useState } from "react";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import {
  getStoredAnonymousUserId,
  onStoredUserIdChange,
} from "@/lib/auth-utils";
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
  const queryUserId = useQueryUserId();

  const [_hasStoredUserId, setHasStoredUserId] = useState(() => {
    return Boolean(getStoredAnonymousUserId());
  });

  useEffect(() => {
    return onStoredUserIdChange(setHasStoredUserId);
  }, []);

  const conversations = usePersistentConvexQuery(
    "conversation-list",
    api.conversations.list,
    queryUserId ? { userId: queryUserId } : "skip"
  );

  // This second query ensures that when a conversation is updated (e.g., title change),
  // this component re-renders to reflect the change in the list.
  usePersistentConvexQuery(
    "current-conversation",
    api.conversations.get,
    currentConversationId && queryUserId
      ? { id: currentConversationId }
      : "skip"
  );

  const conversationsToDisplay = Array.isArray(conversations)
    ? conversations
    : [];

  return (
    <ConversationListContent
      conversations={conversationsToDisplay}
      currentConversationId={currentConversationId}
      isLoading={false}
      searchQuery={searchQuery}
    />
  );
};
