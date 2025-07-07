import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useChatService } from "@/hooks/use-chat-service";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useUser } from "@/hooks/use-user";
import { ROUTES } from "@/lib/routes";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedModel } = useSelectedModel();
  const { user } = useUser();
  const savePrivateConversation = useAction(
    api.conversations.savePrivateConversation
  );
  const { setPrivateMode, setChatInputState } = usePrivateMode();

  const [navigationState, setNavigationState] = useState<{
    initialMessage?: string;
    attachments?: Attachment[];
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
  } | null>(location.state);

  useEffect(() => {
    setPrivateMode(true);

    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  const chatService = useChatService({
    onConversationCreate: (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    overrideMode: "private",
    initialPersonaId: navigationState?.personaId
      ? (navigationState.personaId as Id<"personas">)
      : undefined,
    initialReasoningConfig: navigationState?.reasoningConfig,
  });

  // Sync the current reasoning config with the private mode context
  useEffect(() => {
    if (chatService.currentReasoningConfig) {
      setChatInputState({
        reasoningConfig: chatService.currentReasoningConfig,
      });
    }
  }, [chatService.currentReasoningConfig, setChatInputState]);

  // Handle saving private chat to Convex
  const handleSavePrivateChat = async () => {
    if (!user?._id) {
      toast.error("Cannot save chat", {
        description: "User not authenticated",
      });
      return;
    }

    if (chatService.messages.length === 0) {
      toast.error("No messages to save", {
        description: "Start a private conversation first",
      });
      return;
    }

    try {
      const messagesToSave = chatService.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.createdAt).getTime(),
        model: msg.model,
        provider: msg.provider,
        reasoning: msg.reasoning,
        attachments: msg.attachments?.map(attachment => ({
          type: attachment.type,
          url: attachment.url,
          name: attachment.name,
          size: attachment.size,
          content: attachment.content,
          thumbnail: attachment.thumbnail,
          storageId: attachment.storageId,
          mimeType: attachment.mimeType,
        })),
        citations: msg.citations,
        metadata: msg.metadata,
      }));

      const conversationId = await savePrivateConversation({
        userId: user._id,
        messages: messagesToSave,
        ...(chatService.currentPersonaId && {
          personaId: chatService.currentPersonaId,
        }),
      });

      if (conversationId) {
        toast.success("Private chat saved", {
          description: "All messages have been saved to your chat history",
        });

        // Navigate to the saved conversation
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save private chat";
      toast.error("Failed to save chat", { description: errorMessage });
    }
  };

  // Auto-send initial message for private chat
  useEffect(() => {
    if (
      !chatService.messages.length &&
      navigationState?.initialMessage?.trim() &&
      selectedModel
    ) {
      if (navigationState.initialMessage) {
        chatService.sendMessage(
          navigationState.initialMessage,
          navigationState.attachments,
          navigationState.personaId
            ? (navigationState.personaId as Id<"personas">)
            : null,
          navigationState.reasoningConfig
        );
      }

      // Clear navigation state immediately to prevent re-execution.
      setNavigationState(null);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [
    selectedModel,
    chatService.sendMessage,
    navigationState,
    chatService.messages.length,
    navigate,
    location.pathname,
  ]);

  const canSavePrivateChat = chatService.messages.length > 0;

  const handleSendAsNewConversation = useCallback(
    (
      content: string,
      navigateToNew: boolean,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ): Promise<void> => {
      if (navigateToNew) {
        navigate(ROUTES.HOME, {
          state: {
            initialMessage: content,
            attachments,
            personaId,
            reasoningConfig,
          },
        });
      }
      return Promise.resolve();
    },
    [navigate]
  );

  return (
    <div className="h-screen w-full private-mode-background">
      <UnifiedChatView
        messages={chatService.messages}
        isLoading={chatService.isLoading}
        isLoadingMessages={chatService.isLoadingMessages}
        isStreaming={chatService.isStreaming}
        currentPersonaId={chatService.currentPersonaId}
        currentReasoningConfig={chatService.currentReasoningConfig}
        canSavePrivateChat={canSavePrivateChat}
        hasApiKeys={true}
        onSendMessage={chatService.sendMessage}
        onSendAsNewConversation={handleSendAsNewConversation}
        onDeleteMessage={chatService.deleteMessage}
        onEditMessage={chatService.editMessage}
        onStopGeneration={chatService.stopGeneration}
        onSavePrivateChat={handleSavePrivateChat}
        onRetryUserMessage={chatService.retryUserMessage}
        onRetryAssistantMessage={chatService.retryAssistantMessage}
      />
    </div>
  );
}
