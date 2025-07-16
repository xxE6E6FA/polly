import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { PrivateToggle } from "@/components/private-toggle";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChatService } from "@/hooks/use-chat-service";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserDataContext();
  const queryUserId = user?._id || null;
  const { setPrivateMode } = usePrivateMode();

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  const conversation = usePersistentConvexQuery<{
    _id: string;
    isArchived?: boolean;
    [key: string]: unknown;
  } | null>(
    "conversation-page-conversation",
    api.conversations.getAuthorized,
    queryUserId ? { id: conversationId, userId: queryUserId } : "skip"
  );

  const hasApiKeys = usePersistentConvexQuery<boolean>(
    "conversation-page-api-keys",
    api.apiKeys.hasAnyApiKey,
    {}
  );

  const handleConversationCreate = useCallback(
    (newConversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
    },
    [navigate]
  );

  const chatService = useChatService({
    conversationId: conversationId as ConversationId,
    onConversationCreate: handleConversationCreate,
  });

  // Handle sending message as new conversation
  const handleSendAsNewConversation = useCallback(
    async (
      content: string,
      navigate: boolean,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (chatService.sendMessageToNewConversation) {
        await chatService.sendMessageToNewConversation(
          content,
          navigate,
          attachments,
          conversationId as ConversationId,
          personaId,
          reasoningConfig
        );
      }
    },
    [chatService.sendMessageToNewConversation, conversationId]
  );

  if (conversation === null) {
    return <NotFoundPage />;
  }

  return (
    <>
      <PrivateToggle />
      <UnifiedChatView
        conversationId={conversationId as ConversationId}
        isArchived={conversation?.isArchived}
        messages={chatService.messages}
        isLoading={chatService.isLoading}
        isLoadingMessages={chatService.isLoadingMessages}
        isStreaming={chatService.isStreaming}
        currentPersonaId={chatService.currentPersonaId}
        canSavePrivateChat={false}
        hasApiKeys={hasApiKeys ?? false}
        onSendMessage={chatService.sendMessage}
        onSendAsNewConversation={handleSendAsNewConversation}
        onDeleteMessage={chatService.deleteMessage}
        onEditMessage={chatService.editMessage}
        onStopGeneration={chatService.stopGeneration}
        onRetryUserMessage={chatService.retryUserMessage}
        onRetryAssistantMessage={chatService.retryAssistantMessage}
      />
    </>
  );
}
