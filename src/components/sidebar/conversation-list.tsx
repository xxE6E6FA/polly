import { api } from "convex/_generated/api";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Conversation, ConversationId } from "@/types";
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
  const queryUserId = user?._id || null;

  // biome-ignore lint/suspicious/noConsole: debug sidebar conversation list
  console.log("[sidebar-conversation-list] user:", user);
  // biome-ignore lint/suspicious/noConsole: debug sidebar conversation list
  console.log("[sidebar-conversation-list] queryUserId:", queryUserId);

  const conversations: Array<Conversation> | undefined =
    usePersistentConvexQuery(
      "conversation-list",
      api.conversations.list,
      queryUserId ? { userId: queryUserId } : "skip"
    );

  return (
    <ConversationListContent
      conversations={conversations}
      currentConversationId={currentConversationId}
      isLoading={false}
      searchQuery={searchQuery}
    />
  );
};
