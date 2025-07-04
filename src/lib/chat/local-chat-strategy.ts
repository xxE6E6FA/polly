import { toast } from "sonner";
import { flushSync } from "react-dom";
import {
  type ChatStrategy,
  type ChatStrategyOptions,
  type SendMessageParams,
  type Attachment,
  type ChatMessage,
  type WebSearchCitation,
  type APIKeys,
  type ReasoningConfig,
} from "@/types";

import {
  ClientAIService,
  type AIProviderType,
} from "@/lib/ai/client-ai-service";
import { messageUtils } from "@/lib/ai/message-utils";
import { type Id } from "../../../convex/_generated/dataModel";
import { getDefaultSystemPrompt } from "convex/constants";

// Strategy for local-only chat (no server persistence)
export class LocalChatStrategy implements ChatStrategy {
  private messages: ChatMessage[] = [];
  private isGenerating = false;
  private streamingMessageId: string | null = null;
  private aiService = new ClientAIService();

  constructor(
    private options: ChatStrategyOptions & {
      getSelectedModel: () => { modelId: string; provider: string } | null;

      getCanSendMessage: () => boolean;
      getDecryptedApiKey: (args: {
        provider: AIProviderType;
      }) => Promise<string | null>;
      getPersona?: (
        personaId: Id<"personas">
      ) => Promise<{ prompt: string } | null>;
      savePrivateConversation?: (args: {
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
      }) => Promise<Id<"conversations"> | null>;
      setIsThinking: (value: boolean) => void;
      onMessagesChange?: (messages: ChatMessage[]) => void;
      onStreamingStateChange?: (isStreaming: boolean) => void;
    }
  ) {
    // Always start with empty messages
    this.messages = [];
  }

  private notifyMessagesChanged() {
    // Use flushSync for content updates during streaming, but batch reasoning updates
    if (this.streamingMessageId !== null) {
      // Always use flushSync for streaming content to ensure immediate UI updates
      flushSync(() => {
        this.options.onMessagesChange?.(this.messages);
      });
    } else {
      this.options.onMessagesChange?.(this.messages);
    }
  }

  private notifyStreamingStateChanged(isStreaming: boolean) {
    // Use flushSync for immediate streaming state updates
    flushSync(() => {
      this.options.onStreamingStateChange?.(isStreaming);
    });
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    const { content, attachments, personaId, reasoningConfig, personaPrompt } =
      params;
    // Note: useWebSearch is ignored for private chat

    await this.sendMessageInternal(
      content,
      attachments,
      personaId,
      reasoningConfig,
      personaPrompt
    );
  }

  private async sendMessageInternal(
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    personaPrompt?: string | null
  ): Promise<void> {
    if (!content.trim() && !attachments?.length) {
      return;
    }

    const {
      getSelectedModel,
      getCanSendMessage,
      getDecryptedApiKey,
      setIsThinking,
    } = this.options;

    // Get current values at the start of the method
    const selectedModel = getSelectedModel();
    const canSendMessage = getCanSendMessage();

    if (!canSendMessage) {
      const errorMsg =
        "Message limit reached. Please sign in to continue chatting.";
      toast.error("Cannot send message", { description: errorMsg });
      this.options.onError?.(new Error(errorMsg));
      return;
    }

    if (!selectedModel) {
      const errorMsg =
        "No model selected. Please select a model in the model picker to send messages.";
      toast.error("Cannot send message", { description: errorMsg });
      throw new Error(errorMsg);
    }

    // API key validation happens at getDecryptedApiKey() level

    // Resolve persona prompt if needed and not provided
    let resolvedPersonaPrompt = personaPrompt;
    if (!resolvedPersonaPrompt && personaId && this.options.getPersona) {
      try {
        const persona = await this.options.getPersona(personaId);
        resolvedPersonaPrompt = persona?.prompt || null;
      } catch (_error) {
        // Silently ignore persona resolution errors
      }
    }

    const userMessage = messageUtils.createUserMessage(content, attachments);
    this.messages = messageUtils.addMessage(this.messages, userMessage);
    this.notifyMessagesChanged();

    const assistantMessage = messageUtils.createAssistantMessage(
      selectedModel.modelId,
      selectedModel.provider
    );
    this.messages = messageUtils.addMessage(this.messages, assistantMessage);
    this.notifyMessagesChanged();
    this.streamingMessageId = assistantMessage.id;
    this.notifyStreamingStateChanged(true);

    try {
      this.isGenerating = true;
      setIsThinking(true);

      const provider = selectedModel.provider as AIProviderType;
      const decryptedKey = await getDecryptedApiKey({ provider });

      if (!decryptedKey) {
        throw new Error(`No valid API key found for ${provider}`);
      }

      const apiKeys: APIKeys = {};
      apiKeys[provider as keyof APIKeys] = decryptedKey;

      // Only include completed messages for AI request (exclude the empty assistant message we just created)
      const messagesForAI = this.messages
        .filter(
          msg =>
            msg.role !== "context" &&
            msg.id !== assistantMessage.id && // Exclude the current empty assistant message
            (msg.role !== "assistant" || msg.content.length > 0) // Exclude empty assistant messages
        )
        .map(msg => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          attachments: msg.attachments,
        }));

      // Always add default system prompt as foundation
      const defaultPrompt = getDefaultSystemPrompt(selectedModel.modelId);
      messagesForAI.unshift({
        role: "system" as const,
        content: defaultPrompt,
        attachments: undefined,
      });

      // Add persona prompt as additional system message if provided
      if (resolvedPersonaPrompt) {
        messagesForAI.unshift({
          role: "system" as const,
          content: resolvedPersonaPrompt,
          attachments: undefined,
        });
      }

      let accumulatedContent = "";
      let accumulatedReasoning = "";
      let citations: WebSearchCitation[] = [];

      await this.aiService.streamChat({
        messages: messagesForAI,
        model: selectedModel.modelId,
        provider,
        apiKeys,
        options: {
          reasoningConfig: reasoningConfig?.enabled
            ? reasoningConfig
            : undefined,
        },
        callbacks: {
          onContent: chunk => {
            accumulatedContent += chunk;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                content: accumulatedContent,
              }
            );
            this.notifyMessagesChanged();
          },
          onReasoning: chunk => {
            accumulatedReasoning += chunk;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                reasoning: accumulatedReasoning,
              }
            );
            // Use the same notification pattern as content for consistent UI updates
            this.notifyMessagesChanged();
          },
          onCitations: newCitations => {
            citations = newCitations;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                citations,
              }
            );
            this.notifyMessagesChanged();
          },
          onFinish: finishReason => {
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                metadata: {
                  finishReason,
                },
              }
            );
            this.streamingMessageId = null;
            this.notifyStreamingStateChanged(false);
            this.notifyMessagesChanged();
          },
          onError: error => {
            throw error;
          },
        },
      });
    } catch (error) {
      // Check if this was a manual stop
      if (
        error instanceof Error &&
        (error.message === "StoppedByUser" ||
          error.name === "AbortError" ||
          error.message.includes("AbortError"))
      ) {
        // This is expected behavior when user stops the stream
        // Message metadata is already updated in stopGeneration()
        return;
      }

      // Only remove message and show error for actual errors
      this.messages = messageUtils.removeMessage(
        this.messages,
        assistantMessage.id
      );
      this.streamingMessageId = null;
      this.notifyStreamingStateChanged(false);
      this.notifyMessagesChanged();

      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      toast.error("Failed to send message", { description: errorMessage });
      this.options.onError?.(error as Error);
    } finally {
      this.isGenerating = false;
      setIsThinking(false);
    }
  }

  stopGeneration(): void {
    this.aiService.stopStreaming();

    // Immediately mark the message as stopped for UI feedback
    if (this.streamingMessageId) {
      this.messages = messageUtils.updateMessage(
        this.messages,
        this.streamingMessageId,
        {
          metadata: {
            finishReason: "stop",
            stopped: true,
          },
        }
      );
    }

    this.streamingMessageId = null;
    this.notifyStreamingStateChanged(false);
    this.notifyMessagesChanged();
  }

  deleteMessage(messageId: string): Promise<void> {
    this.messages = messageUtils.removeMessage(this.messages, messageId);
    this.notifyMessagesChanged();
    return Promise.resolve();
  }

  editMessage(messageId: string, content: string): Promise<void> {
    this.messages = messageUtils.updateMessage(this.messages, messageId, {
      content,
    });
    this.notifyMessagesChanged();
    return Promise.resolve();
  }

  async retryUserMessage(messageId: string): Promise<void> {
    // Find the message index
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      toast.error("Cannot retry message", {
        description: "Message not found",
      });
      return;
    }

    const targetMessage = this.messages[messageIndex];
    if (targetMessage.role !== "user") {
      toast.error("Cannot retry message", {
        description: "Can only retry user messages",
      });
      return;
    }

    // Remove this message and all messages after it
    this.messages = this.messages.slice(0, messageIndex);
    this.notifyMessagesChanged();

    // Re-send the message (without persona/reasoning config since they're not stored)
    await this.sendMessageInternal(
      targetMessage.content,
      targetMessage.attachments,
      null, // personaId not stored in local messages
      undefined, // reasoningConfig not stored in local messages
      null // personaPrompt
    );
  }

  async retryAssistantMessage(messageId: string): Promise<void> {
    // Find the message index
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      toast.error("Cannot retry message", {
        description: "Message not found",
      });
      return;
    }

    const targetMessage = this.messages[messageIndex];
    if (targetMessage.role !== "assistant") {
      toast.error("Cannot retry message", {
        description: "Can only retry assistant messages",
      });
      return;
    }

    // Find the previous user message
    const previousUserMessageIndex = messageIndex - 1;
    if (previousUserMessageIndex < 0) {
      toast.error("Cannot retry message", {
        description: "No previous user message found",
      });
      return;
    }

    const previousUserMessage = this.messages[previousUserMessageIndex];
    if (previousUserMessage.role !== "user") {
      toast.error("Cannot retry message", {
        description: "Previous message is not a user message",
      });
      return;
    }

    // Remove the assistant message and all messages after it
    this.messages = this.messages.slice(0, messageIndex);
    this.notifyMessagesChanged();

    // Generate a new assistant response for the existing user message
    const {
      getSelectedModel,
      getCanSendMessage,
      getDecryptedApiKey,
      setIsThinking,
    } = this.options;

    const selectedModel = getSelectedModel();
    const canSendMessage = getCanSendMessage();

    if (!canSendMessage) {
      const errorMsg =
        "Message limit reached. Please sign in to continue chatting.";
      toast.error("Cannot retry message", { description: errorMsg });
      this.options.onError?.(new Error(errorMsg));
      return;
    }

    if (!selectedModel) {
      const errorMsg =
        "No model selected. Please select a model in the model picker to retry messages.";
      toast.error("Cannot retry message", { description: errorMsg });
      throw new Error(errorMsg);
    }

    // Create new assistant message
    const assistantMessage = messageUtils.createAssistantMessage(
      selectedModel.modelId,
      selectedModel.provider
    );
    this.messages = messageUtils.addMessage(this.messages, assistantMessage);
    this.notifyMessagesChanged();
    this.streamingMessageId = assistantMessage.id;
    this.notifyStreamingStateChanged(true);

    try {
      this.isGenerating = true;
      setIsThinking(true);

      const provider = selectedModel.provider as AIProviderType;
      const decryptedKey = await getDecryptedApiKey({ provider });

      if (!decryptedKey) {
        throw new Error(`No valid API key found for ${provider}`);
      }

      const apiKeys: APIKeys = {};
      apiKeys[provider as keyof APIKeys] = decryptedKey;

      // Get all messages up to and including the previous user message
      const messagesForAI = this.messages
        .slice(0, previousUserMessageIndex + 1)
        .filter(
          msg =>
            msg.role !== "context" &&
            (msg.role !== "assistant" || msg.content.length > 0)
        )
        .map(msg => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          attachments: msg.attachments,
        }));

      let accumulatedContent = "";
      let accumulatedReasoning = "";
      let citations: WebSearchCitation[] = [];

      await this.aiService.streamChat({
        messages: messagesForAI,
        model: selectedModel.modelId,
        provider,
        apiKeys,
        options: {},
        callbacks: {
          onContent: chunk => {
            accumulatedContent += chunk;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                content: accumulatedContent,
              }
            );
            this.notifyMessagesChanged();
          },
          onReasoning: chunk => {
            accumulatedReasoning += chunk;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                reasoning: accumulatedReasoning,
              }
            );
            this.notifyMessagesChanged();
          },
          onCitations: newCitations => {
            citations = newCitations;
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                citations,
              }
            );
            this.notifyMessagesChanged();
          },
          onFinish: finishReason => {
            this.messages = messageUtils.updateMessage(
              this.messages,
              assistantMessage.id,
              {
                metadata: {
                  finishReason,
                },
              }
            );
            this.streamingMessageId = null;
            this.notifyStreamingStateChanged(false);
            this.notifyMessagesChanged();
          },
          onError: error => {
            throw error;
          },
        },
      });
    } catch (error) {
      // Check if this was a manual stop
      if (
        error instanceof Error &&
        (error.message === "StoppedByUser" ||
          error.name === "AbortError" ||
          error.message.includes("AbortError"))
      ) {
        // This is expected behavior when user stops the stream
        // Message metadata is already updated in stopGeneration()
        return;
      }

      // Only remove message and show error for actual errors
      this.messages = messageUtils.removeMessage(
        this.messages,
        assistantMessage.id
      );
      this.streamingMessageId = null;
      this.notifyStreamingStateChanged(false);
      this.notifyMessagesChanged();

      const errorMessage =
        error instanceof Error ? error.message : "Failed to retry message";
      toast.error("Failed to retry message", { description: errorMessage });
      this.options.onError?.(error as Error);
    } finally {
      this.isGenerating = false;
      setIsThinking(false);
    }
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  isStreaming(): boolean {
    return this.streamingMessageId !== null;
  }

  isLoading(): boolean {
    return this.isGenerating;
  }

  cleanup(): void {
    // Don't stop streaming on cleanup - let it complete naturally
    // This prevents issues where React effect cleanup interrupts active streams
    // The stream will be properly cleaned up when it completes or when stopGeneration is explicitly called
  }

  async saveToConvex(): Promise<void> {
    const { userId, savePrivateConversation, onConversationCreate } =
      this.options;

    if (!userId || !savePrivateConversation) {
      throw new Error("Cannot save: User not authenticated");
    }

    if (this.messages.length === 0) {
      toast.error("No messages to save", {
        description: "Start a private conversation first",
      });
      return;
    }

    const messagesToSave = this.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      createdAt: new Date(msg.createdAt).getTime(),
      model: msg.model,
      provider: msg.provider,
      reasoning: msg.reasoning,
      attachments: msg.attachments?.map(attachment => ({
        type: attachment.type,
        url: attachment.url,
        name: attachment.name,
        size: attachment.size,
        content: attachment.content,
        thumbnail: attachment.thumbnail,
        storageId: attachment.storageId,
        mimeType: attachment.mimeType,
      })),
      citations: msg.citations,
      metadata: msg.metadata,
    }));

    const conversationId = await savePrivateConversation({
      userId,
      messages: messagesToSave,
      ...(this.options.initialPersonaId && {
        personaId: this.options.initialPersonaId,
      }),
    });

    if (!conversationId) {
      throw new Error("Failed to create conversation");
    }

    toast.success("Private chat saved", {
      description: "All messages have been saved to your chat history",
    });

    this.messages = [];
    this.notifyMessagesChanged();
    onConversationCreate?.(conversationId);
  }
}
