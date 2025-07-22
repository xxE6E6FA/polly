import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ROUTES } from "@/lib/routes";
import { isUserModel } from "@/lib/type-guards";
import { usePrivateMode } from "@/providers/private-mode-context";
import type {
  Attachment,
  ChatMessage,
  ChatMode,
  ConversationId,
  CreateConversationParams,
  ReasoningConfig,
} from "@/types";
import { type ChatStatus, useChatStateMachine } from "./use-chat-state-machine";

import { usePrivateChat } from "./use-private-chat";
import { useServerChat } from "./use-server-chat";

interface ChatServiceOptions {
  conversationId?: ConversationId;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
  initialPersonaId?: Id<"personas">;
  initialReasoningConfig?: ReasoningConfig;
  overrideMode?: ChatMode;
}

interface ChatService {
  // State
  mode: ChatMode;
  messages: ChatMessage[];
  currentPersonaId: Id<"personas"> | null;
  currentReasoningConfig?: ReasoningConfig;

  // State machine properties
  chatStatus: ChatStatus;
  isIdle: boolean;
  isSending: boolean;
  isStreaming: boolean;
  hasError: boolean;
  isStopped: boolean;
  isActive: boolean;
  error: Error | null;
  canRetry: boolean;

  isLoading: boolean;
  isLoadingMessages: boolean;

  // Actions
  sendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  sendMessageToNewConversation: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<ConversationId | undefined>;
  createConversation: (
    params: CreateConversationParams
  ) => Promise<ConversationId | undefined>;
  stopGeneration: () => void;
  deleteMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  retryUserMessage: (
    messageId: string,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  retryAssistantMessage: (
    messageId: string,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  toggleMode: () => void;

  // For compatibility
  conversationId?: ConversationId;
}

export function useChatService({
  conversationId,
  onError,
  onConversationCreate,
  initialPersonaId,
  initialReasoningConfig,
  overrideMode,
}: ChatServiceOptions): ChatService {
  const navigate = useNavigate();
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = isUserModel(selectedModelRaw) ? selectedModelRaw : null;

  // Use override mode if provided, otherwise use context
  const mode: ChatMode =
    overrideMode ?? (isPrivateMode ? "private" : "regular");

  // Initialize chat state machine
  const chatStateMachine = useChatStateMachine();

  // Initialize both chat services
  const serverChat = useServerChat({
    conversationId,
    onError,
    onConversationCreate,
    onInputClear: () => {
      // This will be handled by the chat input component
    },
  });

  const privateChat = usePrivateChat({
    onError,
    initialPersonaId,
    initialReasoningConfig,
  });

  // Determine which service to use based on mode
  const activeService = mode === "private" ? privateChat : serverChat;

  // Unified message handling with state machine integration
  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      // Generate message ID for state tracking
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;

      try {
        chatStateMachine.actions.sendMessage(messageId);

        if (mode === "private") {
          await privateChat.sendMessage({
            content,
            attachments,
            personaId,
            reasoningConfig,
          });
        } else {
          // Regular server mode - add optimistic message first
          if (!selectedModel) {
            toast.error("Cannot send message", {
              description:
                "A conversation must be active and a model selected to send messages.",
            });
            chatStateMachine.actions.setError(
              new Error("Cannot send message without model")
            );
            return;
          }

          // Create optimistic message that will be replaced by server response
          const optimisticMessage: ChatMessage = {
            id: messageId as Id<"messages">,
            role: "user",
            content,
            attachments,
            createdAt: Date.now(),
            isMainBranch: true,
            metadata: { status: "pending" },
          };
          serverChat.addOptimisticMessage(optimisticMessage);

          // Send to server - this will trigger fresh data from Convex that should replace optimistic
          await serverChat.sendMessage(
            content,
            attachments,
            personaId,
            reasoningConfig
          );
        }

        chatStateMachine.actions.endStreaming();
      } catch (error) {
        chatStateMachine.actions.setError(error as Error);
        throw error;
      }
    },
    [mode, privateChat, serverChat, chatStateMachine.actions, selectedModel]
  );

  // Unified stop generation
  const stopGeneration = useCallback(() => {
    if (mode === "private") {
      privateChat.stopGeneration();
    } else {
      serverChat.stopGeneration();
    }
    chatStateMachine.actions.stopGeneration();
  }, [mode, privateChat, serverChat, chatStateMachine.actions]);

  // Unified delete message
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (mode === "private") {
        await privateChat.deleteMessage(messageId);
      } else {
        await serverChat.deleteMessage(messageId);
      }
    },
    [mode, privateChat, serverChat]
  );

  // Unified edit message
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (mode === "private") {
        await privateChat.editMessage(messageId, content);
      } else {
        await serverChat.editMessage(messageId, content);
      }
    },
    [mode, serverChat, privateChat]
  );

  // Unified retry functions
  const retryUserMessage = useCallback(
    async (messageId: string, reasoningConfig?: ReasoningConfig) => {
      if (mode === "private") {
        await privateChat.retryUserMessage(messageId);
      } else {
        await serverChat.retryUserMessage(messageId, reasoningConfig);
      }
    },
    [mode, serverChat, privateChat]
  );

  const retryAssistantMessage = useCallback(
    async (messageId: string, reasoningConfig?: ReasoningConfig) => {
      if (mode === "private") {
        await privateChat.retryAssistantMessage(messageId);
      } else {
        await serverChat.retryAssistantMessage(messageId, reasoningConfig);
      }
    },
    [mode, serverChat, privateChat]
  );

  // Mode toggle with navigation
  const toggleMode = useCallback(() => {
    const currentPersonaId = initialPersonaId; // This could be tracked in state

    togglePrivateMode();

    if (mode === "private") {
      if (privateChat.messages.length > 0) {
        navigate(ROUTES.HOME, {
          state: {
            fromPrivateMode: true,
            privateMessages: privateChat.messages,
            personaId: currentPersonaId,
          },
        });
      } else {
        navigate(ROUTES.HOME);
      }
    } else {
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
    initialPersonaId,
    togglePrivateMode,
    privateChat.messages,
  ]);

  // Wrapper for sendMessageToNewConversation to match the expected interface
  const sendMessageToNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate: boolean,
      attachments?: Attachment[],
      contextSummary?: string,
      sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (mode === "private") {
        // For private mode, just send the message normally
        await privateChat.sendMessage({
          content,
          attachments,
          personaId,
          reasoningConfig,
        });
        return undefined;
      }
      return serverChat.sendMessageToNewConversation(
        content,
        shouldNavigate,
        attachments,
        contextSummary,
        sourceConversationId,
        personaId,
        reasoningConfig
      );
    },
    [mode, privateChat, serverChat]
  );

  // Memoize the service object
  return useMemo(
    () => ({
      // State
      mode,
      messages: activeService.messages,
      currentPersonaId:
        mode === "private"
          ? privateChat.currentPersonaId
          : initialPersonaId || null,
      currentReasoningConfig:
        mode === "private" ? privateChat.currentReasoningConfig : undefined,

      // State machine properties
      chatStatus: chatStateMachine.chatStatus,
      isIdle: chatStateMachine.isIdle,
      isSending: chatStateMachine.isSending,
      isStreaming:
        Boolean(chatStateMachine.isStreaming) ||
        Boolean(activeService.isStreaming),
      hasError: chatStateMachine.hasError,
      isStopped: chatStateMachine.isStopped,
      isActive: chatStateMachine.isActive,
      error: chatStateMachine.error,
      canRetry: chatStateMachine.canRetry,

      isLoading: activeService.isLoading || chatStateMachine.isActive,
      isLoadingMessages: mode === "private" ? false : serverChat.isLoading,

      // Actions
      sendMessage,
      sendMessageToNewConversation,
      createConversation: serverChat.createConversation,
      stopGeneration,
      deleteMessage,
      editMessage,
      retryUserMessage,
      retryAssistantMessage,
      toggleMode,

      // For compatibility
      conversationId,
    }),
    [
      mode,
      activeService.messages,
      activeService.isLoading,
      activeService.isStreaming,
      privateChat.currentPersonaId,
      initialPersonaId,
      privateChat.currentReasoningConfig,
      chatStateMachine.isIdle,
      chatStateMachine.isSending,
      chatStateMachine.isStreaming,
      chatStateMachine.hasError,
      chatStateMachine.isStopped,
      chatStateMachine.isActive,
      chatStateMachine.error,
      chatStateMachine.canRetry,
      serverChat.isLoading,
      serverChat.createConversation,
      sendMessage,
      sendMessageToNewConversation,
      stopGeneration,
      deleteMessage,
      editMessage,
      retryUserMessage,
      retryAssistantMessage,
      toggleMode,
      conversationId,
      chatStateMachine.chatStatus,
    ]
  );
}
