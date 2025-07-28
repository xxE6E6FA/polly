import type { Id } from "@convex/_generated/dataModel";
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

  if (targetMessage.role === "user") {
    // Retry from user message - keep the user message and regenerate assistant response
    return messages.slice(0, messageIndex + 1);
  }
  // Retry from assistant message - delete the assistant message and go back to the previous user message
  const previousUserMessageIndex = messageIndex - 1;
  const previousUserMessage = messages[previousUserMessageIndex];

  if (!previousUserMessage || previousUserMessage.role !== "user") {
    console.error("Cannot find previous user message to retry from");
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
  sendMessage: (params: SendMessageParams) => Promise<void>;
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
  modelOptions: ModelOptions
): ChatHandlers => {
  return {
    async sendMessage(params: SendMessageParams): Promise<void> {
      if (!(modelOptions.model && modelOptions.provider)) {
        throw new Error("Model and provider are required");
      }

      await actions.sendMessage({
        conversationId,
        content: params.content,
        attachments: params.attachments,
        model: modelOptions.model,
        provider: modelOptions.provider,
        reasoningConfig: params.reasoningConfig || modelOptions.reasoningConfig,
        temperature: modelOptions.temperature,
        maxTokens: modelOptions.maxTokens,
        topP: modelOptions.topP,
        frequencyPenalty: modelOptions.frequencyPenalty,
        presencePenalty: modelOptions.presencePenalty,
        webSearchMaxResults: modelOptions.webSearchMaxResults,
        useWebSearch: params.useWebSearch,
      });
    },

    async retryFromMessage(
      messageId: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const mergedOptions = { ...modelOptions, ...options };
      if (!(mergedOptions.model && mergedOptions.provider)) {
        throw new Error("Model and provider are required");
      }

      await actions.retryFromMessage({
        conversationId,
        messageId: messageId as Id<"messages">,
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

    async editMessage(
      messageId: string,
      newContent: string,
      options: ModelOptions = {}
    ): Promise<void> {
      const mergedOptions = { ...modelOptions, ...options };
      if (!(mergedOptions.model && mergedOptions.provider)) {
        throw new Error("Model and provider are required");
      }

      await actions.editAndResend({
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
          onReasoning: (reasoning: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, reasoning } : m
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
    async sendMessage(params: SendMessageParams): Promise<void> {
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

      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      };

      const newMessages = updatedMessages.slice(0, messageIndex + 1);

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
      modelOptions
    );
  }
  return createPrivateChatHandlers(mode.config, modelOptions);
}
