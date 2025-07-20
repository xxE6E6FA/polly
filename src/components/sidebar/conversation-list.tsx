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
    return get(CACHE_KEYS.conversations, []);
  }, [conversationDataRaw]);

  useEffect(() => {
    if (conversations && conversations.length > 0 && !searchQuery.trim()) {
      set(CACHE_KEYS.conversations, conversations);
    }
  }, [conversations, searchQuery]);

  return (
    <ConversationListContent
      conversations={conversations}
      currentConversationId={currentConversationId}
      isLoading={false}
      searchQuery={searchQuery}
    />
  );
};
