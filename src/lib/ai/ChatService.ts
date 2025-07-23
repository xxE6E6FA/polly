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
import { streamChat } from "./client-streaming";

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

// --- Strategy Interface ---
export interface IChatStrategy {
  sendMessage(params: SendMessageParams): Promise<void>;
  retryFromMessage(messageId: string, options: ModelOptions): Promise<void>;
  editMessage(
    messageId: string,
    newContent: string,
    options: ModelOptions
  ): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  stopGeneration(): void;
  saveConversation?(title?: string): Promise<Id<"conversations"> | null>;
}

// --- Concrete Strategies ---

export class ServerChatStrategy implements IChatStrategy {
  constructor(
    private conversationId: ConversationId,
    private mutations: {
      // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
      sendMessage: any;
      // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
      editAndResend: any;
      // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
      deleteMessage: any;
      // biome-ignore lint/suspicious/noExplicitAny: Convex mutation result type
      stopGeneration: any;
    },
    private modelOptions: ModelOptions
  ) {}

  async sendMessage(params: SendMessageParams): Promise<void> {
    await this.mutations.sendMessage({
      conversationId: this.conversationId,
      content: params.content,
      attachments: params.attachments,
      model: this.modelOptions.model!,
      provider: this.modelOptions.provider!,
      reasoningConfig:
        params.reasoningConfig || this.modelOptions.reasoningConfig,
      temperature: this.modelOptions.temperature,
      maxTokens: this.modelOptions.maxTokens,
      topP: this.modelOptions.topP,
      frequencyPenalty: this.modelOptions.frequencyPenalty,
      presencePenalty: this.modelOptions.presencePenalty,
      webSearchMaxResults: this.modelOptions.webSearchMaxResults,
      useWebSearch: params.useWebSearch,
    });
  }

  async retryFromMessage(
    messageId: string,
    options: ModelOptions
  ): Promise<void> {
    // For server mode, retry is handled by editAndResend with empty content
    const mergedOptions = { ...this.modelOptions, ...options };
    await this.mutations.editAndResend({
      messageId: messageId as Id<"messages">,
      newContent: "", // Empty content means retry with same content
      model: mergedOptions.model!,
      provider: mergedOptions.provider!,
      reasoningConfig: mergedOptions.reasoningConfig,
      temperature: mergedOptions.temperature,
      maxTokens: mergedOptions.maxTokens,
      topP: mergedOptions.topP,
      frequencyPenalty: mergedOptions.frequencyPenalty,
      presencePenalty: mergedOptions.presencePenalty,
      webSearchMaxResults: mergedOptions.webSearchMaxResults,
    });
  }

  async editMessage(
    messageId: string,
    newContent: string,
    options: ModelOptions
  ): Promise<void> {
    const mergedOptions = { ...this.modelOptions, ...options };
    await this.mutations.editAndResend({
      messageId: messageId as Id<"messages">,
      newContent,
      model: mergedOptions.model!,
      provider: mergedOptions.provider!,
      reasoningConfig: mergedOptions.reasoningConfig,
      temperature: mergedOptions.temperature,
      maxTokens: mergedOptions.maxTokens,
      topP: mergedOptions.topP,
      frequencyPenalty: mergedOptions.frequencyPenalty,
      presencePenalty: mergedOptions.presencePenalty,
      webSearchMaxResults: mergedOptions.webSearchMaxResults,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.mutations.deleteMessage({ id: messageId as Id<"messages"> });
  }

  stopGeneration(): void {
    this.mutations.stopGeneration({ conversationId: this.conversationId });
  }
}

export class PrivateChatStrategy implements IChatStrategy {
  private abortController: AbortController | null = null;

  constructor(
    private messages: ChatMessage[],
    private setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    // biome-ignore lint/suspicious/noExplicitAny: Convex action result type
    private saveConversationAction: any,
    private modelOptions: ModelOptions,
    private getDecryptedApiKey: (args: {
      provider: string;
      modelId: string;
    }) => Promise<string | null>,
    private modelCapabilities: ModelForCapabilities
  ) {}

  async sendMessage(params: SendMessageParams): Promise<void> {
    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: params.content,
      attachments: params.attachments,
      createdAt: Date.now(),
      isMainBranch: true,
      useWebSearch: params.useWebSearch,
    };
    this.setMessages(prev => [...prev, userMessage]);

    // Add assistant placeholder
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model: this.modelOptions.model,
      provider: this.modelOptions.provider,
      createdAt: Date.now(),
      isMainBranch: true,
    };
    this.setMessages(prev => [...prev, assistantMessage]);

    // Get API key for the provider
    const provider = this.modelOptions.provider!;
    const modelId = this.modelOptions.model!;
    const apiKey = await this.getDecryptedApiKey({ provider, modelId });

    if (!apiKey) {
      throw new Error(`No API key found for ${provider}`);
    }

    const apiKeys: APIKeys = {
      [provider]: apiKey,
    };

    // Start streaming
    this.abortController = new AbortController();
    await streamChat(
      {
        messages: [...this.messages, userMessage].map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          attachments: m.attachments,
        })),
        model: this.modelCapabilities,
        apiKeys,
        options: {
          temperature: this.modelOptions.temperature,
          maxTokens: this.modelOptions.maxTokens,
          topP: this.modelOptions.topP,
          frequencyPenalty: this.modelOptions.frequencyPenalty,
          presencePenalty: this.modelOptions.presencePenalty,
          reasoningConfig:
            params.reasoningConfig || this.modelOptions.reasoningConfig,
        },
        callbacks: {
          onContent: (content: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + content }
                  : m
              )
            );
          },
          onReasoning: (reasoning: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, reasoning } : m
              )
            );
          },
          onCitations: (citations: WebSearchCitation[]) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, citations } : m
              )
            );
          },
          onFinish: (finishReason: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, metadata: { ...m.metadata, finishReason } }
                  : m
              )
            );
          },
          onError: (error: Error) => {
            this.setMessages(prev =>
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
      this.abortController
    );
  }

  async retryFromMessage(
    messageId: string,
    options: ModelOptions
  ): Promise<void> {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return;
    }

    // Remove messages after this one
    const newMessages = this.messages.slice(0, messageIndex + 1);
    this.setMessages(newMessages);

    // Add new assistant placeholder
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model: options.model || this.modelOptions.model,
      provider: options.provider || this.modelOptions.provider,
      createdAt: Date.now(),
      isMainBranch: true,
    };
    this.setMessages(prev => [...prev, assistantMessage]);

    // Get API key for the provider
    const mergedOptions = { ...this.modelOptions, ...options };
    const provider = mergedOptions.provider!;
    const modelId = mergedOptions.model!;
    const apiKey = await this.getDecryptedApiKey({ provider, modelId });

    if (!apiKey) {
      throw new Error(`No API key found for ${provider}`);
    }

    const apiKeys: APIKeys = {
      [provider]: apiKey,
    };

    // Start streaming
    this.abortController = new AbortController();
    await streamChat(
      {
        messages: newMessages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          attachments: m.attachments,
        })),
        model: this.modelCapabilities,
        apiKeys,
        options: {
          temperature: mergedOptions.temperature,
          maxTokens: mergedOptions.maxTokens,
          topP: mergedOptions.topP,
          frequencyPenalty: mergedOptions.frequencyPenalty,
          presencePenalty: mergedOptions.presencePenalty,
          reasoningConfig: mergedOptions.reasoningConfig,
        },
        callbacks: {
          onContent: (content: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + content }
                  : m
              )
            );
          },
          onReasoning: (reasoning: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, reasoning } : m
              )
            );
          },
          onCitations: (citations: WebSearchCitation[]) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, citations } : m
              )
            );
          },
          onFinish: (finishReason: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, metadata: { ...m.metadata, finishReason } }
                  : m
              )
            );
          },
          onError: (error: Error) => {
            this.setMessages(prev =>
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
      this.abortController
    );
  }

  async editMessage(
    messageId: string,
    newContent: string,
    options: ModelOptions
  ): Promise<void> {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return;
    }

    // Update the message content
    const updatedMessages = [...this.messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: newContent,
    };

    // Remove messages after this one
    const newMessages = updatedMessages.slice(0, messageIndex + 1);
    this.setMessages(newMessages);

    // Add new assistant placeholder
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model: options.model || this.modelOptions.model,
      provider: options.provider || this.modelOptions.provider,
      createdAt: Date.now(),
      isMainBranch: true,
    };
    this.setMessages(prev => [...prev, assistantMessage]);

    // Get API key for the provider
    const mergedOptions = { ...this.modelOptions, ...options };
    const provider = mergedOptions.provider!;
    const modelId = mergedOptions.model!;
    const apiKey = await this.getDecryptedApiKey({ provider, modelId });

    if (!apiKey) {
      throw new Error(`No API key found for ${provider}`);
    }

    const apiKeys: APIKeys = {
      [provider]: apiKey,
    };

    // Start streaming
    this.abortController = new AbortController();
    await streamChat(
      {
        messages: newMessages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          attachments: m.attachments,
        })),
        model: this.modelCapabilities,
        apiKeys,
        options: {
          temperature: mergedOptions.temperature,
          maxTokens: mergedOptions.maxTokens,
          topP: mergedOptions.topP,
          frequencyPenalty: mergedOptions.frequencyPenalty,
          presencePenalty: mergedOptions.presencePenalty,
          reasoningConfig: mergedOptions.reasoningConfig,
        },
        callbacks: {
          onContent: (content: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + content }
                  : m
              )
            );
          },
          onReasoning: (reasoning: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, reasoning } : m
              )
            );
          },
          onCitations: (citations: WebSearchCitation[]) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId ? { ...m, citations } : m
              )
            );
          },
          onFinish: (finishReason: string) => {
            this.setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, metadata: { ...m.metadata, finishReason } }
                  : m
              )
            );
          },
          onError: (error: Error) => {
            this.setMessages(prev =>
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
      this.abortController
    );
  }

  // biome-ignore lint/suspicious/useAwait: Implementing interface method
  async deleteMessage(messageId: string): Promise<void> {
    this.setMessages(prev => prev.filter(m => m.id !== messageId));
    return Promise.resolve();
  }

  stopGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async saveConversation(title?: string): Promise<Id<"conversations"> | null> {
    return await this.saveConversationAction({
      messages: this.messages,
      title,
    });
  }
}

// --- Chat Service ---
export class ChatService {
  private strategy: IChatStrategy;

  constructor(strategy: IChatStrategy) {
    this.strategy = strategy;
  }

  public setStrategy(strategy: IChatStrategy) {
    this.strategy = strategy;
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    return await this.strategy.sendMessage(params);
  }

  async retryFromMessage(
    messageId: string,
    options: ModelOptions
  ): Promise<void> {
    return await this.strategy.retryFromMessage(messageId, options);
  }

  async editMessage(
    messageId: string,
    newContent: string,
    options: ModelOptions
  ): Promise<void> {
    return await this.strategy.editMessage(messageId, newContent, options);
  }

  async deleteMessage(messageId: string): Promise<void> {
    return await this.strategy.deleteMessage(messageId);
  }

  stopGeneration(): void {
    this.strategy.stopGeneration();
  }

  async saveConversation(title?: string): Promise<Id<"conversations"> | null> {
    if (this.strategy.saveConversation) {
      return await this.strategy.saveConversation(title);
    }
    return null;
  }
}
