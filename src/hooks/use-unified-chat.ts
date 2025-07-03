import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery, useConvex } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useThinking } from "@/providers/thinking-provider";
import { useSelectedModel } from "./use-selected-model";
import { useUser } from "./use-user";
import { useChat } from "./use-chat";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { api } from "../../convex/_generated/api";
import { ROUTES } from "@/lib/routes";

import {
  type ChatStrategy,
  type ChatMode,
  type Attachment,
  type ConversationId,
  type WebSearchCitation,
  type ChatMessage,
  type ReasoningConfig,
} from "@/types";
import { LocalChatStrategy } from "@/lib/chat/local-chat-strategy";
import { type AIProviderType } from "@/lib/ai/client-ai-service";
import { type Id } from "../../convex/_generated/dataModel";

interface UseUnifiedChatOptions {
  conversationId?: ConversationId;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
  initialMessage?: string;
  initialAttachments?: Attachment[];
  initialPersonaId?: Id<"personas">;
  initialReasoningConfig?: ReasoningConfig;
  overrideMode?: ChatMode; // Optional override for specific use cases
}

export function useUnifiedChat({
  conversationId,
  onError,
  onConversationCreate,
  initialMessage,
  initialAttachments,
  initialPersonaId,
  initialReasoningConfig,
  overrideMode,
}: UseUnifiedChatOptions) {
  const navigate = useNavigate();
  const { user, canSendMessage } = useUser();
  const { setIsThinking } = useThinking();
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();
  const { selectedModel } = useSelectedModel();

  // Note: API keys are loaded by ChatInput directly, no need to load them here

  const getDecryptedApiKey = useAction(api.apiKeys.getDecryptedApiKey);
  const savePrivateConversation = useAction(
    api.conversations.savePrivateConversation
  );
  const convex = useConvex();

  // Use override mode if provided, otherwise use context
  const mode: ChatMode =
    overrideMode ?? (isPrivateMode ? "private" : "regular");

  const [currentPersonaId, setCurrentPersonaId] =
    useState<Id<"personas"> | null>(initialPersonaId || null);
  const currentPersona = useQuery(
    api.personas.get,
    currentPersonaId ? { id: currentPersonaId } : "skip"
  );

  const strategyRef = useRef<ChatStrategy | null>(null);
  const lastModeRef = useRef<ChatMode | null>(null);

  // State to track messages and trigger re-renders
  const [privateMessagesState, setPrivateMessagesState] = useState<
    ChatMessage[]
  >([]);
  const [privateStreamingState, setPrivateStreamingState] = useState(false);

  // Use regular chat hook for Convex mode
  const regularChat = useChat({
    conversationId,
    onError,
    onConversationCreate,
  });

  // Initialize strategy based on mode
  useEffect(() => {
    // Only need strategy for private mode
    if (mode !== "private") {
      strategyRef.current = null;
      return;
    }

    // Don't wait for hasApiKeys to be defined - use false as default
    if (!selectedModel) {
      return;
    }

    // Only recreate if we don't have a strategy for private mode
    if (lastModeRef.current === mode && strategyRef.current) {
      // Don't recreate if we're currently streaming
      if (strategyRef.current.isStreaming?.()) {
        return;
      }
      return;
    }

    lastModeRef.current = mode;

    const privateStrategy = new LocalChatStrategy({
      userId: user?._id,
      onError,
      onConversationCreate,
      // Use getter functions for values that might change
      getSelectedModel: () => selectedModel,

      getCanSendMessage: () => canSendMessage,
      getDecryptedApiKey: getDecryptedApiKey as (args: {
        provider: AIProviderType;
      }) => Promise<string | null>,
      getPersona: async (personaId: Id<"personas">) => {
        return await convex.query(api.personas.get, { id: personaId });
      },
      savePrivateConversation: savePrivateConversation as unknown as (args: {
        userId: Id<"users">;
        messages: Array<{
          role: string;
          content: string;
          createdAt: number;
          model?: string;
          provider?: string;
          reasoning?: string;
          attachments?: Attachment[];
          citations?: WebSearchCitation[];
          metadata?: Record<string, unknown>;
        }>;
        personaId?: Id<"personas">;
      }) => Promise<Id<"conversations"> | null>,
      setIsThinking,
      onMessagesChange: messages => {
        setPrivateMessagesState(messages);
      },
      onStreamingStateChange: isStreaming => {
        setPrivateStreamingState(isStreaming);
      },
    });

    strategyRef.current = privateStrategy;

    return () => {
      strategyRef.current?.cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedModel]); // Remove hasApiKeys from dependencies

  // Common interface methods
  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (personaId) {
        setCurrentPersonaId(personaId);
      }

      if (mode === "private") {
        if (!strategyRef.current) {
          toast.error("Chat not ready", {
            description: "Please wait a moment and try again",
          });
          return;
        }

        await strategyRef.current.sendMessage({
          content,
          attachments,
          useWebSearch,
          personaId,
          reasoningConfig,
          personaPrompt:
            personaId && currentPersona ? currentPersona.prompt : null,
        });
      } else {
        // Regular mode - use regularChat directly
        await regularChat.sendMessage(
          content,
          attachments,
          useWebSearch,
          currentPersona?.prompt,
          personaId,
          reasoningConfig
        );
      }
    },
    [currentPersona, mode, regularChat]
  );

  const stopGeneration = useCallback(() => {
    if (mode === "private") {
      strategyRef.current?.stopGeneration();
    } else {
      regularChat.stopGeneration();
    }
  }, [mode, regularChat]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (mode === "private") {
        if (!strategyRef.current) return;
        await strategyRef.current.deleteMessage(messageId);
      } else {
        // Regular chat doesn't have deleteMessage - would need to implement if needed
        console.warn("Delete message not implemented for regular chat");
      }
    },
    [mode]
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (mode === "private") {
        if (!strategyRef.current) return;
        await strategyRef.current.editMessage(messageId, content);
      } else {
        await regularChat.editMessage(messageId, content);
      }
    },
    [mode, regularChat]
  );

  const retryUserMessage = useCallback(
    async (messageId: string) => {
      if (mode === "private") {
        if (!strategyRef.current) return;
        const privateStrategy = strategyRef.current as LocalChatStrategy;
        await privateStrategy.retryUserMessage(messageId);
      } else {
        await regularChat.retryUserMessage(messageId);
      }
    },
    [mode, regularChat]
  );

  const retryAssistantMessage = useCallback(
    async (messageId: string) => {
      if (mode === "private") {
        if (!strategyRef.current) return;
        const privateStrategy = strategyRef.current as LocalChatStrategy;
        await privateStrategy.retryAssistantMessage(messageId);
      } else {
        await regularChat.retryAssistantMessage(messageId);
      }
    },
    [mode, regularChat]
  );

  // Get current state from strategy
  const messages =
    mode === "private" ? privateMessagesState : regularChat.messages;
  const isLoading =
    mode === "private"
      ? (strategyRef.current?.isLoading() ?? false)
      : regularChat.isLoading;
  const isStreaming =
    mode === "private" ? privateStreamingState : regularChat.isStreaming;

  const savePrivateChat = useCallback(async () => {
    if (mode !== "private" || !strategyRef.current) {
      return;
    }

    const privateStrategy = strategyRef.current as LocalChatStrategy;
    try {
      await privateStrategy.saveToConvex();
      setPrivateMessagesState([]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save private chat";
      toast.error("Failed to save chat", { description: errorMessage });
      onError?.(error as Error);
    }
  }, [mode, onError]);

  // Auto-send initial message when strategy is ready
  const hasInitialMessage = !!initialMessage?.trim();
  const autoSentRef = useRef(false);

  useEffect(() => {
    if (
      hasInitialMessage &&
      !autoSentRef.current &&
      mode === "private" &&
      strategyRef.current &&
      selectedModel
    ) {
      autoSentRef.current = true;

      // Use setTimeout to ensure the component is fully mounted
      setTimeout(() => {
        sendMessage(
          initialMessage!,
          initialAttachments,
          undefined, // Web search disabled for private chat
          initialPersonaId,
          initialReasoningConfig
        ).catch(_error => {
          autoSentRef.current = false; // Allow retry
        });
      }, 100);
    }
  }, [
    hasInitialMessage,
    mode,
    selectedModel,
    initialMessage,
    initialAttachments,
    initialPersonaId,
    initialReasoningConfig,
    sendMessage,
  ]);

  const toggleMode = useCallback(() => {
    // Toggle the global private mode state
    togglePrivateMode();

    if (mode === "private") {
      // If we have messages in private mode, save them first before switching
      if (privateMessagesState.length > 0) {
        // Navigate to regular chat with a prompt to save the private chat
        navigate(ROUTES.HOME, {
          state: {
            fromPrivateMode: true,
            privateMessages: privateMessagesState,
            personaId: currentPersonaId,
          },
        });
      } else {
        // No messages, just navigate
        navigate(ROUTES.HOME);
      }
    } else {
      // Going to private mode - preserve any current input state
      navigate(ROUTES.PRIVATE_CHAT, {
        state: {
          fromRegularMode: true,
          personaId: currentPersonaId,
        },
      });
    }
  }, [
    mode,
    navigate,
    currentPersonaId,
    togglePrivateMode,
    privateMessagesState,
  ]);

  return {
    // State
    mode,
    messages,
    isLoading,
    isStreaming,
    currentPersonaId,
    canSavePrivateChat: mode === "private" && messages.length > 0,

    // Actions
    sendMessage,
    sendMessageToNewConversation: regularChat.sendMessageToNewConversation,
    stopGeneration,
    deleteMessage,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
    savePrivateChat,
    toggleMode,

    // For compatibility
    conversationId,
    isLoadingMessages: mode === "private" ? false : regularChat.isLoading,
  };
}
