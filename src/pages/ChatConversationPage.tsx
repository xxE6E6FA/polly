import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const { setPrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );
  const [currentTemperature, setCurrentTemperature] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  const handleSendAsNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate: boolean,
      attachments?: Attachment[],
      contextSummary?: string,
      sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      try {
        const result = await createBranchingConversationAction({
          firstMessage: content,
          sourceConversationId: sourceConversationId as Id<"conversations">,
          personaId: personaId ?? undefined,
          attachments,
          reasoningConfig:
            reasoningConfig?.enabled && reasoningConfig.effort
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort,
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
          contextSummary,
          useWebSearch: true,
          generateTitle: true,
        });

        if (result?.conversationId) {
          if (shouldNavigate) {
            navigate(ROUTES.CHAT_CONVERSATION(result.conversationId));
          }
          return result.conversationId;
        }
      } catch (error) {
        console.error("Failed to create branching conversation:", error);
      }
      return undefined;
    },
    [createBranchingConversationAction, navigate]
  );

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  // Override the selected model to match the last used model in this conversation
  useConversationModelOverride(conversationId as ConversationId);

  const conversationAccessInfo = useQuery(api.conversations.getWithAccessInfo, {
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

  // Handle conversation access scenarios
  if (conversationAccessInfo === undefined) {
    // Still loading
    return null;
  }

  if (conversationAccessInfo.isDeleted) {
    // Conversation was deleted, redirect to home
    navigate(ROUTES.HOME);
    return null;
  }

  if (!conversationAccessInfo.hasAccess) {
    // User doesn't have access to this conversation, show 404
    return <NotFoundPage />;
  }

  const conversation = conversationAccessInfo.conversation;

  return (
    <UnifiedChatView
      conversationId={conversationId as ConversationId}
      messages={messages}
      isLoading={isLoading || hasApiKeys === undefined}
      isLoadingMessages={conversationAccessInfo === undefined}
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
      onSendAsNewConversation={handleSendAsNewConversation}
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
  );
}
