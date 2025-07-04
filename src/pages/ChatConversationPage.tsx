import { useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";

import { useQuery } from "convex/react";

import { UnifiedChatView } from "@/components/unified-chat-view";
import { PrivateToggle } from "@/components/private-toggle";
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

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  const conversation = useQuery(
    api.conversations.getAuthorized,
    queryUserId ? { id: conversationId, userId: queryUserId } : "skip"
  );

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const handleConversationCreate = useCallback(
    (newConversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
    },
    [navigate]
  );

  const {
    messages,
    isLoading,
    isStreaming,
    currentPersonaId,
    sendMessage,
    stopGeneration,
    deleteMessage,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
  } = useUnifiedChat({
    conversationId: conversationId as ConversationId,
    onConversationCreate: handleConversationCreate,
  });

  if (userLoading) {
    return <div>Loading...</div>;
  }

  if (conversation === null) {
    return <NotFoundPage />;
  }

  return (
    <>
      <PrivateToggle />
      <UnifiedChatView
        conversationId={conversationId as ConversationId}
        isArchived={conversation?.isArchived}
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        currentPersonaId={currentPersonaId}
        canSavePrivateChat={false}
        hasApiKeys={hasApiKeys ?? false}
        onSendMessage={sendMessage}
        onDeleteMessage={deleteMessage}
        onEditMessage={editMessage}
        onStopGeneration={stopGeneration}
        onRetryUserMessage={retryUserMessage}
        onRetryAssistantMessage={retryAssistantMessage}
      />
    </>
  );
}
