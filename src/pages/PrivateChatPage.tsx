import { useNavigate, useLocation } from "react-router";
import { useAction } from "convex/react";
import { useEffect, useRef } from "react";

import { UnifiedChatView } from "@/components/unified-chat-view";
import { useUnifiedChat } from "@/hooks/use-unified-chat";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { usePrivateMode } from "@/contexts/private-mode-context";

import { ROUTES } from "@/lib/routes";
import { ClientAIService, type AIProvider } from "@/lib/ai/client-ai-service";
import { type ConversationId, type Attachment } from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedModel = useSelectedModel();
  const getDecryptedApiKey = useAction(api.apiKeys.getDecryptedApiKey);
  const { setPrivateMode } = usePrivateMode();

  // Extract initial message from navigation state and clear it after first use
  const navigationState = location.state as {
    initialMessage?: string;
    attachments?: Attachment[];
    useWebSearch?: boolean;
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
  } | null;

  const initialNavigationState = useRef(navigationState);

  // Clear navigation state immediately after capturing it
  useEffect(() => {
    if (initialNavigationState.current?.initialMessage) {
      // Replace the current history entry without the state to clear it
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [navigate, location.pathname]);

  // Lock private mode while on this page
  useEffect(() => {
    setPrivateMode(true);

    // Reset private mode when leaving the page
    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  // Pre-warm API connection when entering private mode
  useEffect(() => {
    if (selectedModel) {
      const provider = selectedModel.provider as AIProvider;

      // Get decrypted API key and warm up connection
      getDecryptedApiKey({ provider }).then(apiKey => {
        if (apiKey) {
          ClientAIService.preWarmProvider(provider, apiKey);
        }
      });
    }
  }, [selectedModel, getDecryptedApiKey]);

  const {
    messages,
    isLoading,
    isStreaming,
    hasStreamingContent,
    currentPersonaId,
    canSavePrivateChat,
    sendMessage,
    deleteMessage,
    editMessage,
    stopGeneration,
    savePrivateChat,
    retryUserMessage,
    retryAssistantMessage,
  } = useUnifiedChat({
    onConversationCreate: (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    overrideMode: "private",
    // Pass initial message from captured navigation state
    initialMessage: initialNavigationState.current?.initialMessage,
    initialAttachments: initialNavigationState.current?.attachments,
    initialUseWebSearch: initialNavigationState.current?.useWebSearch,
    initialPersonaId: initialNavigationState.current?.personaId
      ? (initialNavigationState.current.personaId as Id<"personas">)
      : undefined,
    initialReasoningConfig: initialNavigationState.current?.reasoningConfig,
  });

  return (
    <UnifiedChatView
      messages={messages}
      isLoading={isLoading}
      isStreaming={isStreaming}
      hasStreamingContent={hasStreamingContent}
      currentPersonaId={currentPersonaId}
      canSavePrivateChat={canSavePrivateChat}
      hasApiKeys={true} // ChatInput handles its own API key loading
      onSendMessage={sendMessage}
      onDeleteMessage={deleteMessage}
      onEditMessage={editMessage}
      onStopGeneration={stopGeneration}
      onSavePrivateChat={savePrivateChat}
      onRetryUserMessage={retryUserMessage}
      onRetryAssistantMessage={retryAssistantMessage}
    />
  );
}
