import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { DEFAULT_BUILTIN_MODEL_ID } from "@shared/constants";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelectedModel } from "@/hooks/use-selected-model";
import {
  type ChatMode,
  createChatHandlers,
  type ModelOptions,
  type SendMessageParams,
} from "@/lib/ai/chat-handlers";
import { isUserModel } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  ChatMessage,
  ConversationId,
  MessageRole,
  ModelForCapabilities,
} from "@/types";

type UseChatParams = {
  conversationId?: ConversationId;
  initialMessages?: ChatMessage[];
};

export function mapServerMessageToChatMessage(
  msg: Doc<"messages">
): ChatMessage {
  return {
    id: msg._id,
    role: msg.role as MessageRole,
    content: msg.content,
    status: msg.status,
    statusText: msg.statusText ?? undefined,
    reasoning: msg.reasoning,
    reasoningParts: msg.reasoningParts as ChatMessage["reasoningParts"],
    model: msg.model,
    provider: msg.provider,
    parentId: msg.parentId,
    isMainBranch: msg.isMainBranch,
    sourceConversationId: msg.sourceConversationId,
    useWebSearch: msg.useWebSearch,
    attachments: msg.attachments,
    citations: msg.citations,
    toolCalls: msg.toolCalls as ChatMessage["toolCalls"],
    error: msg.error,
    personaName: msg.personaName,
    personaIcon: msg.personaIcon,
    metadata: msg.metadata,
    imageGeneration: msg.imageGeneration
      ? {
          ...msg.imageGeneration,
          status: msg.imageGeneration.status as
            | "starting"
            | "processing"
            | "succeeded"
            | "failed"
            | "canceled"
            | undefined,
        }
      : undefined,
    createdAt: msg.createdAt,
  };
}

export function useChat({ conversationId, initialMessages }: UseChatParams) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? []
  );
  const [isLoading, setIsLoading] = useState(
    conversationId ? initialMessages === undefined : false
  );
  const { user } = useUserDataContext();

  // Get user's selected model via Zustand-backed hook
  const { selectedModel } = useSelectedModel();

  // Get decrypted API key action for private mode
  const getDecryptedApiKeyAction = useAction(api.apiKeys.getDecryptedApiKey);

  // Wrapper function to match the expected signature
  const getDecryptedApiKey = useCallback(
    async (args: { provider: string; modelId: string }) => {
      return await getDecryptedApiKeyAction({
        provider: args.provider as
          | "openai"
          | "anthropic"
          | "google"
          | "openrouter"
          | "replicate",
        modelId: args.modelId,
      });
    },
    [getDecryptedApiKeyAction]
  );

  // --- Server Mode Dependencies ---
  const serverMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip"
  );
  const sendMessageAction = useAction(api.conversations.sendMessage);
  const editAndResendAction = useAction(api.conversations.editAndResendMessage);
  const retryFromMessageAction = useAction(api.conversations.retryFromMessage);
  const deleteMessageMutation = useMutation(api.messages.remove);
  const stopGenerationMutation = useMutation(api.conversations.stopGeneration);

  // --- Private Mode Dependencies ---
  const saveConversationAction = useAction(
    api.conversations.savePrivateConversation
  );

  // Model options from selected model (these are user preferences, not model capabilities)
  const modelOptions: ModelOptions = useMemo(
    () => ({
      model: selectedModel?.modelId ?? DEFAULT_BUILTIN_MODEL_ID,
      provider: selectedModel?.provider ?? "google",
      // These would come from user settings, not the model definition
      temperature: undefined,
      maxTokens: undefined,
      topP: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
    }),
    [selectedModel]
  );

  // Model capabilities for private mode
  const modelCapabilities: ModelForCapabilities | null = useMemo(() => {
    if (!(selectedModel && isUserModel(selectedModel))) {
      return null;
    }
    return {
      ...selectedModel,
      modelId: selectedModel.modelId,
      provider: selectedModel.provider,
      name: selectedModel.name,
      contextLength: selectedModel.contextLength,
      supportsReasoning: selectedModel.supportsReasoning,
      supportsImages: selectedModel.supportsImages,
      supportsTools: selectedModel.supportsTools,
      supportsFiles: selectedModel.supportsFiles,
    };
  }, [selectedModel]);

  // --- Chat Handlers ---
  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    setMessages(initialMessages ?? []);
    setIsLoading(conversationId ? initialMessages === undefined : false);
  }, [conversationId, initialMessages]);

  const chatHandlers = useMemo(() => {
    if (conversationId) {
      const mode: ChatMode = {
        type: "server",
        conversationId,
        actions: {
          sendMessage: sendMessageAction,
          editAndResend: editAndResendAction,
          retryFromMessage: retryFromMessageAction,
          deleteMessage: deleteMessageMutation,
          stopGeneration: stopGenerationMutation,
        },
        getAuthToken: () => authRef.current || null,
      };
      return createChatHandlers(mode, modelOptions);
    }
    if (modelCapabilities) {
      const mode: ChatMode = {
        type: "private",
        config: {
          messages,
          setMessages,
          saveConversationAction,
          getDecryptedApiKey,
          modelCapabilities,
        },
      };
      return createChatHandlers(mode, modelOptions);
    }
    // Return handlers that throw errors when model is not loaded
    return {
      sendMessage: () => {
        throw new Error("Model not loaded");
      },
      retryFromMessage: () => {
        throw new Error("Model not loaded");
      },
      editMessage: () => {
        throw new Error("Model not loaded");
      },
      deleteMessage: () => {
        throw new Error("Model not loaded");
      },
      stopGeneration: () => {
        throw new Error("Model not loaded");
      },
      saveConversation: () => {
        throw new Error("Model not loaded");
      },
    };
  }, [
    conversationId,
    sendMessageAction,
    deleteMessageMutation,
    stopGenerationMutation,
    saveConversationAction,
    messages,
    modelOptions,
    getDecryptedApiKey,
    modelCapabilities,
    retryFromMessageAction,
    editAndResendAction,
  ]);

  // Sync server messages to local state
  useEffect(() => {
    if (conversationId) {
      if (serverMessages === undefined) {
        setIsLoading(initialMessages === undefined);
        return;
      }
      if (serverMessages) {
        // Handle both array and paginated results
        const messageArray = Array.isArray(serverMessages)
          ? serverMessages
          : serverMessages.page;

        // Convert server messages to ChatMessage format
        const convertedMessages: ChatMessage[] = messageArray.map(
          (msg: Doc<"messages">) => mapServerMessageToChatMessage(msg)
        );

        setMessages(convertedMessages);
        setIsLoading(false); // Set loading to false when we have messages
      } else {
        // No messages returned; treat as empty state
        setMessages([]);
        setIsLoading(false);
      }
      return;
    }
    // When there's no server conversation selected (private mode / new chat)
    setIsLoading(false);
  }, [serverMessages, conversationId, initialMessages]);

  // --- Public API ---
  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      if (!selectedModel) {
        throw new Error("No model selected");
      }

      // For server mode, optimistic updates are handled by the mutation
      // For private mode, they're handled by the handlers
      await chatHandlers.sendMessage(params);
    },
    [selectedModel, chatHandlers.sendMessage]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string, options?: ModelOptions) => {
      if (!selectedModel) {
        throw new Error("No model selected");
      }

      await chatHandlers.editMessage(messageId, newContent, options || {});
    },
    [selectedModel, chatHandlers.editMessage]
  );

  const retryFromMessage = useCallback(
    async (messageId: string, options?: ModelOptions) => {
      if (!selectedModel) {
        throw new Error("No model selected");
      }

      await chatHandlers.retryFromMessage(messageId, options || {});
    },
    [selectedModel, chatHandlers.retryFromMessage]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await chatHandlers.deleteMessage(messageId);
    },
    [chatHandlers.deleteMessage]
  );

  const stopGeneration = useCallback(() => {
    // Optimistically mark the last assistant message as stopped
    // This provides immediate UI feedback before the server confirms
    setMessages(prev => {
      const lastAssistantIdx = prev.findLastIndex(m => m.role === "assistant");
      if (lastAssistantIdx === -1) {
        return prev;
      }
      return prev.map((m, i) =>
        i === lastAssistantIdx
          ? {
              ...m,
              status: "done" as const,
              metadata: {
                ...m.metadata,
                stopped: true,
                finishReason: "user_stopped",
              },
            }
          : m
      );
    });
    chatHandlers.stopGeneration();
  }, [chatHandlers.stopGeneration]);

  const saveConversation = useCallback(
    async (title?: string) => {
      return (await chatHandlers.saveConversation?.(title)) || null;
    },
    [chatHandlers.saveConversation]
  );

  // Derive streaming state from message status
  const isStreaming = useMemo(() => {
    if (messages.length === 0) {
      return false;
    }

    // Find the most recent assistant message
    let lastAssistant: ChatMessage | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === "assistant") {
        lastAssistant = message;
        break;
      }
    }

    if (!lastAssistant) {
      return false;
    }

    const status = lastAssistant.status;
    const hasFinish = Boolean(lastAssistant.metadata?.finishReason);
    const isStopped = Boolean(lastAssistant.metadata?.stopped);

    // Only consider streaming if message has an explicit streaming status.
    // This prevents undefined/null/unknown status from being treated as streaming,
    // which was causing infinite spinning when messages were created without proper status.
    const isActiveStreamingStatus =
      status === "thinking" || status === "streaming" || status === "searching";

    // Message is streaming if it has an active status AND no finish indicator
    return isActiveStreamingStatus && !(hasFinish || isStopped);
  }, [messages]);

  // Check if we can save (private mode only)
  const canSave = useMemo(() => {
    return !conversationId && messages.length > 0 && !user?.isAnonymous;
  }, [conversationId, messages, user]);

  return {
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
    selectedModel,
  };
}
