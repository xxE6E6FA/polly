import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAction } from "convex/react";

import { UnifiedChatView } from "@/components/unified-chat-view";
import { useUnifiedChat } from "@/hooks/use-unified-chat";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useChatVisualMode } from "@/hooks/use-chat-visual-mode";
import { cn } from "@/lib/utils";

import { ROUTES } from "@/lib/routes";
import {
  ClientAIService,
  type AIProviderType,
} from "@/lib/ai/client-ai-service";
import {
  type ConversationId,
  type Attachment,
  type ReasoningConfig,
} from "@/types";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedModel } = useSelectedModel();
  const getDecryptedApiKey = useAction(api.apiKeys.getDecryptedApiKey);
  const { setPrivateMode } = usePrivateMode();
  const visualMode = useChatVisualMode();

  const navigationState = location.state as {
    initialMessage?: string;
    attachments?: Attachment[];
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
  } | null;

  const initialNavigationState = useRef(navigationState);

  useEffect(() => {
    if (initialNavigationState.current?.initialMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [navigate, location.pathname]);

  useEffect(() => {
    setPrivateMode(true);

    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  useEffect(() => {
    if (selectedModel) {
      const provider = selectedModel.provider as AIProviderType;

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
    currentPersonaId,
    canSavePrivateChat,
    sendMessage,
    stopGeneration,
    savePrivateChat,
    deleteMessage,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
  } = useUnifiedChat({
    onConversationCreate: (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    overrideMode: "private",
    initialMessage: initialNavigationState.current?.initialMessage,
    initialAttachments: initialNavigationState.current?.attachments,
    initialPersonaId: initialNavigationState.current?.personaId
      ? (initialNavigationState.current.personaId as Id<"personas">)
      : undefined,
    initialReasoningConfig: initialNavigationState.current?.reasoningConfig,
  });

  return (
    <div
      className={cn(
        "h-screen w-full transition-all duration-700 ease-in-out",
        visualMode.isPrivateMode
          ? "bg-[radial-gradient(ellipse_800px_300px_at_bottom,rgba(147,51,234,0.06),transparent_70%)] dark:bg-[radial-gradient(ellipse_800px_300px_at_bottom,rgba(147,51,234,0.08),transparent_70%)]"
          : "bg-background"
      )}
    >
      <UnifiedChatView
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        currentPersonaId={currentPersonaId}
        canSavePrivateChat={canSavePrivateChat}
        hasApiKeys={true}
        onSendMessage={sendMessage}
        onDeleteMessage={deleteMessage}
        onEditMessage={editMessage}
        onStopGeneration={stopGeneration}
        onSavePrivateChat={savePrivateChat}
        onRetryUserMessage={retryUserMessage}
        onRetryAssistantMessage={retryAssistantMessage}
      />
    </div>
  );
}
