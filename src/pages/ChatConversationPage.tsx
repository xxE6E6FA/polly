import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { PrivateToggle } from "@/components/private-toggle";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const { setPrivateMode } = usePrivateMode();
  const [currentTemperature, setCurrentTemperature] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  // Override the selected model to match the last used model in this conversation
  useConversationModelOverride(conversationId as ConversationId);

  const conversation = useQuery(api.conversations.get, {
    id: conversationId as Id<"conversations">,
  });

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const conversationIsStreaming = useQuery(api.conversations.isStreaming, {
    conversationId: conversationId as Id<"conversations">,
  });

  const {
    messages,
    isLoading,
    isStreaming: messageIsStreaming,
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
        messages={messages}
        isLoading={isLoading || hasApiKeys === undefined}
        isLoadingMessages={conversation === undefined}
        isStreaming={messageIsStreaming || (conversationIsStreaming ?? false)}
        currentPersonaId={conversation?.personaId ?? null}
        currentTemperature={currentTemperature}
        canSavePrivateChat={false}
        hasApiKeys={hasApiKeys === true}
        isArchived={conversation?.isArchived}
        onSendMessage={async (
          content: string,
          attachments?: Attachment[],
          personaId?: Id<"personas"> | null,
          reasoningConfig?: ReasoningConfig,
          temperature?: number
        ) => {
          await sendMessage({
            content,
            attachments,
            personaId,
            reasoningConfig,
            temperature,
          });
        }}
        onSendAsNewConversation={async () => {
          // This functionality would need to be implemented separately
          return await Promise.resolve(undefined);
        }}
        onDeleteMessage={deleteMessage}
        onEditMessage={editMessage}
        onStopGeneration={stopGeneration}
        onTemperatureChange={setCurrentTemperature}
        onRetryUserMessage={async (
          messageId,
          modelId,
          provider,
          reasoningConfig,
          temperature
        ) => {
          const options: Partial<{
            model: string;
            provider: string;
            reasoningConfig: ReasoningConfig;
            temperature: number;
          }> = {};
          if (modelId) {
            options.model = modelId;
          }
          if (provider) {
            options.provider = provider;
          }
          if (reasoningConfig) {
            options.reasoningConfig = reasoningConfig;
          }
          if (temperature !== undefined) {
            options.temperature = temperature;
          }

          await retryFromMessage(messageId, options);
        }}
        onRetryAssistantMessage={async (
          messageId,
          modelId,
          provider,
          reasoningConfig,
          temperature
        ) => {
          const options: Partial<{
            model: string;
            provider: string;
            reasoningConfig: ReasoningConfig;
            temperature: number;
          }> = {};
          if (modelId) {
            options.model = modelId;
          }
          if (provider) {
            options.provider = provider;
          }
          if (reasoningConfig) {
            options.reasoningConfig = reasoningConfig;
          }
          if (temperature !== undefined) {
            options.temperature = temperature;
          }

          await retryFromMessage(messageId, options);
        }}
      />
    </>
  );
}
