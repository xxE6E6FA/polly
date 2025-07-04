import { useEffect, useRef, useState, useTransition } from "react";
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
  const [isExiting, setIsExiting] = useState(false);
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevPrivateMode = useRef(visualMode.isPrivateMode);

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

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle private mode transitions
  useEffect(() => {
    // Only trigger exit animation when transitioning from true to false
    if (prevPrivateMode.current && !visualMode.isPrivateMode) {
      setIsExiting(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Use transition for smooth state updates
      startTransition(() => {
        timeoutRef.current = setTimeout(() => {
          setIsExiting(false);
          timeoutRef.current = null;
        }, 700); // Match the CSS animation duration
      });
    }

    // Update the ref for next comparison
    prevPrivateMode.current = visualMode.isPrivateMode;
  }, [visualMode.isPrivateMode, startTransition]);

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
    isLoadingMessages,
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

  // Show background when in private mode or during exit animation
  const showPrivateBackground = visualMode.isPrivateMode || isExiting;

  return (
    <div
      className={cn(
        "h-screen w-full transition-all duration-700 ease-in-out",
        showPrivateBackground && "private-mode-background",
        isExiting && "exiting"
      )}
    >
      <UnifiedChatView
        messages={messages}
        isLoading={isLoading}
        isLoadingMessages={isLoadingMessages}
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
