import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
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

  const conversationDataRaw = useQuery(
    api.conversations.list,
    user
      ? {
          includeArchived: false,
        }
      : "skip"
  );

  // Handle the different return types from the conversations.list query
  const conversations = useMemo(() => {
    if (Array.isArray(conversationDataRaw)) {
      return conversationDataRaw;
    }
    return get(CACHE_KEYS.conversations, []);
  }, [conversationDataRaw]);

  // Cache conversations in local storage when they change
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      set(CACHE_KEYS.conversations, conversations);
    }
  }, [conversations]);

  return (
    <ConversationListContent
      conversations={conversations}
      currentConversationId={currentConversationId}
      isLoading={false}
      searchQuery={searchQuery}
    />
  );
};
