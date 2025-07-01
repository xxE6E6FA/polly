import { useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";

import { useQuery } from "convex/react";

import { UnifiedChatView } from "@/components/unified-chat-view";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { useUnifiedChat } from "@/hooks/use-unified-chat";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useUser } from "@/hooks/use-user";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { ROUTES } from "@/lib/routes";
import { type ConversationId } from "@/types";

import { api } from "../../convex/_generated/api";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { isLoading: userLoading } = useUser();
  const queryUserId = useQueryUserId();
  const { setPrivateMode } = usePrivateMode();

  // Ensure we're not in private mode when viewing a conversation
  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  // Query conversation even while user is loading (will be skipped until user is available)
  const conversation = useQuery(
    api.conversations.getAuthorized,
    queryUserId ? { id: conversationId, userId: queryUserId } : "skip"
  );

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const handleError = useCallback((_error: Error) => {
    // Error is handled by the UI components
  }, []);

  const handleConversationCreate = useCallback(
    (newConversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
    },
    [navigate]
  );

  const {
    messages,
    currentPersonaId,
    canSavePrivateChat,
    isLoading,
    isLoadingMessages,
    sendMessage,
    sendMessageToNewConversation,
    stopGeneration,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
    deleteMessage,
    isStreaming,
  } = useUnifiedChat({
    conversationId: conversationId as ConversationId,
    onError: handleError,
    onConversationCreate: handleConversationCreate,
  });

  // If user is loaded and the query has completed and conversation is null,
  // It means either the conversation doesn't exist or user doesn't have access
  if (!userLoading && conversation === null) {
    return <NotFoundPage />;
  }

  return (
    <UnifiedChatView
      conversationId={conversationId as ConversationId}
      messages={messages}
      isLoading={isLoading}
      isLoadingMessages={isLoadingMessages || userLoading}
      isStreaming={isStreaming}
      currentPersonaId={currentPersonaId}
      canSavePrivateChat={canSavePrivateChat}
      hasApiKeys={hasApiKeys ?? true}
      isArchived={conversation?.isArchived ?? false}
      onSendMessage={sendMessage}
      onSendMessageToNewConversation={sendMessageToNewConversation}
      onDeleteMessage={deleteMessage}
      onEditMessage={editMessage}
      onStopGeneration={stopGeneration}
      onRetryUserMessage={retryUserMessage}
      onRetryAssistantMessage={retryAssistantMessage}
    />
  );
}
