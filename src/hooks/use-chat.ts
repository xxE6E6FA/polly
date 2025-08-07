import { api } from "@convex/_generated/api";
import { DEFAULT_BUILTIN_MODEL_ID } from "@shared/constants";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ChatMode,
  createChatHandlers,
  type ModelOptions,
  type SendMessageParams,
} from "@/lib/ai/chat-handlers";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { isUserModel } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  ChatMessage,
  ConversationId,
  ModelForCapabilities,
} from "@/types";

type UseChatParams = {
  conversationId?: ConversationId;
};

export function useChat({ conversationId }: UseChatParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useUserDataContext();

  // Get user's selected model
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = useMemo(
    () => selectedModelRaw ?? get(CACHE_KEYS.selectedModel, null),
    [selectedModelRaw]
  );

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
      if (serverMessages) {
        // Handle both array and paginated results
        const messageArray = Array.isArray(serverMessages)
          ? serverMessages
          : serverMessages.page;

        // Convert server messages to ChatMessage format
        const convertedMessages: ChatMessage[] = messageArray.map(
          // biome-ignore lint/suspicious/noExplicitAny: Server message type varies
          (msg: any) => ({
            id: msg._id,
            role: msg.role,
            content: msg.content,
            status: msg.status,
            reasoning: msg.reasoning,
            model: msg.model,
            provider: msg.provider,
            parentId: msg.parentId,
            isMainBranch: msg.isMainBranch,
            sourceConversationId: msg.sourceConversationId,
            useWebSearch: msg.useWebSearch,
            attachments: msg.attachments,
            citations: msg.citations,
            metadata: msg.metadata,
            imageGeneration: msg.imageGeneration, // Add imageGeneration field
            createdAt: msg.createdAt,
          })
        );

        setMessages(convertedMessages);
        setIsLoading(false); // Set loading to false when we have messages
      } else {
        // Private mode is never loading from a server
        setIsLoading(false);
      }
    }
  }, [serverMessages, conversationId]);

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
    // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
    console.log(
      "[useChat] stopGeneration called, forwarding to chatHandlers.stopGeneration"
    );
    chatHandlers.stopGeneration();
  }, [chatHandlers.stopGeneration]);

  const saveConversation = useCallback(
    async (title?: string) => {
      return (await chatHandlers.saveConversation?.(title)) || null;
    },
    [chatHandlers.saveConversation]
  );

  // Check if any message is currently streaming
  const isStreaming = useMemo(() => {
    return messages.some(
      m =>
        m.role === "assistant" &&
        (!m.metadata?.finishReason || m.metadata?.finishReason === "streaming")
    );
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
