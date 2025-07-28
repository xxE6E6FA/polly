import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserDataContext();
  const { setPrivateMode } = usePrivateMode();
  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const [navigationState, setNavigationState] = useState<{
    initialMessage?: string;
    attachments?: Attachment[];
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
  } | null>(location.state);

  const [currentPersonaId, setCurrentPersonaId] =
    useState<Id<"personas"> | null>(
      navigationState?.personaId as Id<"personas"> | null
    );

  useEffect(() => {
    setPrivateMode(true);

    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  const {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    editMessage,
    retryFromMessage,
    deleteMessage,
    stopGeneration,
    saveConversation,
    canSave,
  } = useChat({});

  // Handle initial message from navigation state
  useEffect(() => {
    if (navigationState?.initialMessage && messages.length === 0) {
      sendMessage({
        content: navigationState.initialMessage,
        attachments: navigationState.attachments,
        personaId: navigationState.personaId as Id<"personas"> | null,
        reasoningConfig: navigationState.reasoningConfig,
      });
      // Clear navigation state after sending
      setNavigationState(null);
    }
  }, [navigationState, messages.length, sendMessage]);

  // Handle saving private chat to Convex
  const handleSavePrivateChat = useCallback(async () => {
    if (!user?._id) {
      toast.error("Cannot save chat", {
        description: "User not authenticated",
      });
      return;
    }

    if (!canSave) {
      toast.error("No messages to save", {
        description: "Start a private conversation first",
      });
      return;
    }

    try {
      const conversationId = await saveConversation();
      if (conversationId) {
        toast.success("Chat saved successfully");
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    } catch (error) {
      console.error("Failed to save private conversation:", error);
      toast.error("Failed to save chat", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [user, canSave, saveConversation, navigate]);

  // Handle sending message as new conversation
  const handleSendAsNewConversation = useCallback(
    async (
      content: string,
      _shouldNavigate: boolean,
      attachments?: Attachment[],
      _contextSummary?: string,
      _sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ): Promise<ConversationId | undefined> => {
      // In private mode, we just send the message to the current chat
      await sendMessage({
        content,
        attachments,
        personaId,
        reasoningConfig,
      });
      return undefined;
    },
    [sendMessage]
  );

  return (
    <UnifiedChatView
      isArchived={false}
      messages={messages}
      isLoading={isLoading}
      isLoadingMessages={false}
      isStreaming={isStreaming}
      currentPersonaId={currentPersonaId}
      canSavePrivateChat={canSave}
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
        if (personaId !== currentPersonaId) {
          setCurrentPersonaId(personaId || null);
        }
      }}
      onSendAsNewConversation={handleSendAsNewConversation}
      onDeleteMessage={deleteMessage}
      onEditMessage={editMessage}
      onStopGeneration={stopGeneration}
      onRetryUserMessage={async (
        messageId,
        modelId,
        provider,
        reasoningConfig
      ) => {
        await retryFromMessage(messageId, {
          model: modelId,
          provider,
          reasoningConfig,
        });
      }}
      onRetryAssistantMessage={async (
        messageId,
        modelId,
        provider,
        reasoningConfig
      ) => {
        await retryFromMessage(messageId, {
          model: modelId,
          provider,
          reasoningConfig,
        });
      }}
      onSavePrivateChat={handleSavePrivateChat}
    />
  );
}
