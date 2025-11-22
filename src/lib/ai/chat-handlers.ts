import type { Id } from "@convex/_generated/dataModel";
import { cleanAttachmentsForConvex } from "@/lib/utils";
import {
  getChatKey,
  getSelectedPersonaIdFromStore,
} from "@/stores/chat-input-store";

import type {
  APIKeys,
  Attachment,
  ChatMessage,
  ConversationId,
  ModelForCapabilities,
  ReasoningConfig,
  WebSearchCitation,
} from "@/types";
import { streamChat } from "./browser-streaming";

// --- Type Definitions ---
export interface SendMessageParams {
  content: string;
  attachments?: Attachment[];
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
  useWebSearch?: boolean;
  temperature?: number;
}

export interface ModelOptions {
  model?: string;
  provider?: string;
  reasoningConfig?: ReasoningConfig;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  // Optional extra knobs (provider-dependent)
  topK?: number;
  repetitionPenalty?: number;
  webSearchMaxResults?: number;
}

// --- Private Chat Utilities ---

/**
 * Handles message array manipulation for retry operations in private chat
 */
function prepareMessagesForRetry(
  messages: ChatMessage[],
  messageIndex: number
): ChatMessage[] | null {
  const targetMessage = messages[messageIndex];

  if (!targetMessage) {
    return null;
  }

  if (targetMessage.role === "user") {
    // Retry from user message - keep the user message and regenerate assistant response
    return messages.slice(0, messageIndex + 1);
  }
  // Retry from assistant message - delete the assistant message and go back to the previous user message
  const previousUserMessageIndex = messageIndex - 1;
  const previousUserMessage = messages[previousUserMessageIndex];

  if (!previousUserMessage || previousUserMessage.role !== "user") {
    return null;
  }

  // Keep messages up to (and including) the previous user message
  return messages.slice(0, previousUserMessageIndex + 1);
}

/**
 * Shared logic for generating a new assistant response in private chat
 */
async function generateNewAssistantResponse(
  newMessages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  baseModelOptions: ModelOptions,
  overrideOptions: ModelOptions,
  streamMessage: (
    messageHistory: ChatMessage[],
    assistantMessageId: string,
    options: ModelOptions
  ) => Promise<void>
): Promise<void> {
  setMessages(newMessages);

  // Create assistant message with merged options
  const mergedOptions = { ...baseModelOptions, ...overrideOptions };
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    model: overrideOptions.model || baseModelOptions.model,
    provider: overrideOptions.provider || baseModelOptions.provider,
    createdAt: Date.now(),
    isMainBranch: true,
  };
  setMessages(prev => [...prev, assistantMessage]);

  await streamMessage(newMessages, assistantMessage.id, mergedOptions);
}

// --- Chat Mode Discriminated Union ---
export type ChatMode =
  | {
      type: "server";
      conversationId: ConversationId;
      actions: ConvexActions;
      getAuthToken?: () => string | null;
    }
  | {
      type: "private";
      config: PrivateChatConfig;
    };

export interface ConvexActions {
  // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
  sendMessage: any;
  // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
  editAndResend: any;
  // biome-ignore lint/suspicious/noExplicitAny: Convex action result type
  retryFromMessage: any;
  // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
  deleteMessage: any;
  // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
  stopGeneration: any;
}

export interface PrivateChatConfig {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  // biome-ignore lint/suspicious/noExplicitAny: Convex action result type
  saveConversationAction: any;
  getDecryptedApiKey: (args: {
    provider: string;
    modelId: string;
  }) => Promise<string | null>;
  modelCapabilities: ModelForCapabilities;
}

// --- Chat Handlers Interface ---
export interface ChatHandlers {
  sendMessage: (
    params: SendMessageParams
  ) => Promise<{ userMessageId: string; assistantMessageId: string } | void>;
  retryFromMessage: (
    messageId: string,
    options?: ModelOptions
  ) => Promise<void>;
  editMessage: (
    messageId: string,
    content: string,
    options?: ModelOptions
  ) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  stopGeneration: () => void;
  saveConversation?: (title?: string) => Promise<Id<"conversations"> | null>;
}

// --- Server Chat Handlers ---
export const createServerChatHandlers = (
  conversationId: ConversationId,
  actions: ConvexActions,
  modelOptions: ModelOptions,
  _getAuthToken?: () => string | null
): ChatHandlers => {
  // Use a safe default so specs don't require env vars; empty string yields same-origin path
  const _convexUrl = import.meta.env.VITE_CONVEX_URL ?? "";

  return {
    async sendMessage(
      params: SendMessageParams
    ): Promise<{ userMessageId: string; assistantMessageId: string } | void> {
      if (!(modelOptions.model && modelOptions.provider)) {
        throw new Error("Model and provider are required");
      }

      const sendPayload: Record<string, unknown> = {
        conversationId,
        content: params.content,
        attachments: cleanAttachmentsForConvex(params.attachments),
        model: modelOptions.model,
        provider: modelOptions.provider,
        reasoningConfig: params.reasoningConfig || modelOptions.reasoningConfig,
        temperature: params.temperature ?? modelOptions.temperature,
        maxTokens: modelOptions.maxTokens,
        topP: modelOptions.topP,
        frequencyPenalty: modelOptions.frequencyPenalty,
        presencePenalty: modelOptions.presencePenalty,
        webSearchMaxResults: modelOptions.webSearchMaxResults,
        useWebSearch: params.useWebSearch,
      };
      if (params.personaId != null) {
        sendPayload.personaId = params.personaId as Id<"personas">;
      }
      const result = await actions.sendMessage(sendPayload);

      return {
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
      };
    },

    async retryFromMessage(
      messageId: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const mergedOptions = { ...modelOptions, ...options };
      if (!(mergedOptions.model && mergedOptions.provider)) {
        throw new Error("Model and provider are required");
      }
      const _isImageProvider =
        mergedOptions.provider?.toLowerCase() === "replicate";

      // Determine selected persona for this conversation (if set in UI)
      const chatKey = getChatKey(conversationId);
      const selectedPersonaId =
        getSelectedPersonaIdFromStore(chatKey) || undefined;

      const _result = await actions.retryFromMessage({
        conversationId,
        messageId: messageId as Id<"messages">,
        model: mergedOptions.model,
        provider: mergedOptions.provider,
        personaId: selectedPersonaId,
        reasoningConfig: mergedOptions.reasoningConfig,
        temperature: mergedOptions.temperature,
        maxTokens: mergedOptions.maxTokens,
        topP: mergedOptions.topP,
        frequencyPenalty: mergedOptions.frequencyPenalty,
        presencePenalty: mergedOptions.presencePenalty,
        webSearchMaxResults: mergedOptions.webSearchMaxResults,
      });
    },

    async editMessage(
      messageId: string,
      newContent: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const mergedOptions = { ...modelOptions, ...options };
      if (!(mergedOptions.model && mergedOptions.provider)) {
        throw new Error("Model and provider are required");
      }
      const _isImageProvider =
        mergedOptions.provider?.toLowerCase() === "replicate";
      const _result = await actions.editAndResend({
        messageId: messageId as Id<"messages">,
        newContent,
        model: mergedOptions.model,
        provider: mergedOptions.provider,
        reasoningConfig: mergedOptions.reasoningConfig,
        temperature: mergedOptions.temperature,
        maxTokens: mergedOptions.maxTokens,
        topP: mergedOptions.topP,
        frequencyPenalty: mergedOptions.frequencyPenalty,
        presencePenalty: mergedOptions.presencePenalty,
        webSearchMaxResults: mergedOptions.webSearchMaxResults,
      });
    },

    async deleteMessage(messageId: string): Promise<void> {
      await actions.deleteMessage({ id: messageId as Id<"messages"> });
    },

    stopGeneration(): void {
      actions.stopGeneration({ conversationId });
    },
  };
};

// --- Private Chat Handlers ---
let currentAbortController: AbortController | null = null;

export const createPrivateChatHandlers = (
  config: PrivateChatConfig,
  modelOptions: ModelOptions
): ChatHandlers => {
  const {
    messages,
    setMessages,
    saveConversationAction,
    getDecryptedApiKey,
    modelCapabilities,
  } = config;

  const streamMessage = async (
    messageHistory: ChatMessage[],
    assistantMessageId: string,
    options: ModelOptions
  ) => {
    if (!(options.provider && options.model)) {
      throw new Error("Model and provider are required");
    }

    const provider = options.provider;
    const modelId = options.model;
    const apiKey = await getDecryptedApiKey({ provider, modelId });

    if (!apiKey) {
      throw new Error(`No API key found for ${provider}`);
    }

    const apiKeys: APIKeys = {
      [provider]: apiKey,
    };

    currentAbortController = new AbortController();
    await streamChat(
      {
        messages: messageHistory.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          attachments: m.attachments,
        })),
        model: modelCapabilities,
        apiKeys,
        options: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          // Provider-specific extras (will be ignored by others)
          topK: (options as { topK?: number }).topK,
          repetitionPenalty: (options as { repetitionPenalty?: number })
            .repetitionPenalty,
          reasoningConfig: options.reasoningConfig,
        },
        callbacks: {
          onContent: (content: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + content }
                  : m
              )
            );
          },
          onReasoning: (delta: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, reasoning: (m.reasoning || "") + delta }
                  : m
              )
            );
          },
          onCitations: (citations: WebSearchCitation[]) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, citations } : m
              )
            );
          },
          onFinish: (finishReason: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, metadata: { ...m.metadata, finishReason } }
                  : m
              )
            );
          },
          onError: (error: Error) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: `Error: ${error.message}`,
                      metadata: { ...m.metadata, finishReason: "error" },
                    }
                  : m
              )
            );
          },
        },
      },
      currentAbortController
    );
  };

  return {
    async sendMessage(
      params: SendMessageParams
    ): Promise<{ userMessageId: string; assistantMessageId: string } | void> {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: params.content,
        attachments: params.attachments,
        createdAt: Date.now(),
        isMainBranch: true,
        useWebSearch: params.useWebSearch,
      };
      setMessages(prev => [...prev, userMessage]);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        model: modelOptions.model,
        provider: modelOptions.provider,
        createdAt: Date.now(),
        isMainBranch: true,
      };
      setMessages(prev => [...prev, assistantMessage]);

      const messageHistory = [...messages, userMessage];
      const options = {
        ...modelOptions,
        reasoningConfig: params.reasoningConfig || modelOptions.reasoningConfig,
        temperature: params.temperature ?? modelOptions.temperature,
      };

      await streamMessage(messageHistory, assistantMessage.id, options);
    },

    async retryFromMessage(
      messageId: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        return;
      }

      const targetMessage = messages[messageIndex];

      if (!targetMessage) {
        return;
      }

      if (targetMessage.role === "assistant") {
        // For assistant retry: clear the assistant message and stream into the same message
        // First stop any ongoing streaming
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }

        // Find previous user message for context
        const previousUserMessageIndex = messageIndex - 1;
        const previousUserMessage = messages[previousUserMessageIndex];

        if (!previousUserMessage || previousUserMessage.role !== "user") {
          return;
        }

        // Get messages up to (and including) the previous user message
        const contextMessages = messages.slice(0, previousUserMessageIndex + 1);

        const mergedOptions = { ...modelOptions, ...options };

        // Clear the assistant message content and reset streaming state
        const clearedAssistantMessage: ChatMessage = {
          id: targetMessage.id,
          role: targetMessage.role,
          content: "",
          isMainBranch: targetMessage.isMainBranch,
          createdAt: targetMessage.createdAt,
          reasoning: undefined,
          citations: undefined,
          // Update model/provider optimistically if changed
          model: mergedOptions.model || targetMessage.model,
          provider: mergedOptions.provider || targetMessage.provider,
          metadata: { ...targetMessage.metadata, finishReason: undefined },
        };

        // Update state: remove messages after the assistant message and clear assistant content
        const updatedMessages = [...contextMessages, clearedAssistantMessage];
        setMessages(updatedMessages);

        // Stream into the existing assistant message
        await streamMessage(contextMessages, targetMessage.id, mergedOptions);
        return;
      }

      // For user message retry: use existing logic
      const newMessages = prepareMessagesForRetry(messages, messageIndex);
      if (!newMessages) {
        return;
      }

      await generateNewAssistantResponse(
        newMessages,
        setMessages,
        modelOptions,
        options,
        streamMessage
      );
    },

    async editMessage(
      messageId: string,
      newContent: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        return;
      }

      // Update the user message content
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      } as ChatMessage;

      // Delete all messages after the edited user message
      const newMessages = updatedMessages.slice(0, messageIndex + 1);

      // Update the messages state to remove subsequent messages
      setMessages(newMessages);

      await generateNewAssistantResponse(
        newMessages,
        setMessages,
        modelOptions,
        options,
        streamMessage
      );
    },

    // biome-ignore lint/suspicious/useAwait: Implementing interface method
    async deleteMessage(messageId: string): Promise<void> {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return Promise.resolve();
    },

    stopGeneration(): void {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;

        // Mark the last assistant message as stopped by user
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            return prev.map((m, index) =>
              index === prev.length - 1
                ? {
                    ...m,
                    status: "done",
                    metadata: { ...m.metadata, finishReason: "user_stopped" },
                  }
                : m
            );
          }
          return prev;
        });
      }
    },

    async saveConversation(
      title?: string
    ): Promise<Id<"conversations"> | null> {
      return await saveConversationAction({
        messages,
        title,
      });
    },
  };
};

// --- Factory Function ---
export function createChatHandlers(
  mode: ChatMode,
  modelOptions: ModelOptions
): ChatHandlers {
  if (mode.type === "server") {
    return createServerChatHandlers(
      mode.conversationId,
      mode.actions,
      modelOptions,
      mode.getAuthToken
    );
  }
  return createPrivateChatHandlers(mode.config, modelOptions);
}
