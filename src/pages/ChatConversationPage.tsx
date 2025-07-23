import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { PrivateToggle } from "@/components/private-toggle";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { ConversationId } from "@/types";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const { setPrivateMode } = usePrivateMode();

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  const conversation = useQuery(api.conversations.get, {
    id: conversationId as Id<"conversations">,
  });

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    editMessage,
    retryFromMessage,
    deleteMessage,
    stopGeneration,
  } = useChat({
    conversationId: conversationId as ConversationId,
  });

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
        isLoadingMessages={false}
        isStreaming={isStreaming}
        currentPersonaId={conversation?.personaId || null}
        canSavePrivateChat={false}
        hasApiKeys={hasApiKeys ?? false}
        onSendMessage={async (
          content,
          attachments,
          personaId,
          reasoningConfig
        ) => {
          await sendMessage({
            content,
            attachments,
            personaId,
            reasoningConfig,
          });
        }}
        onSendAsNewConversation={async () => {
          // This functionality would need to be implemented separately
          return await Promise.resolve(undefined);
        }}
        onDeleteMessage={deleteMessage}
        onEditMessage={editMessage}
        onStopGeneration={stopGeneration}
        onRetryUserMessage={async messageId => {
          await retryFromMessage(messageId);
        }}
        onRetryAssistantMessage={async messageId => {
          await retryFromMessage(messageId);
        }}
      />
    </>
  );
}
