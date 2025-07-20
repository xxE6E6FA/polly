import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getDefaultSystemPrompt } from "convex/constants";
import { useAction, useConvex, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type AIProviderType, streamChat } from "@/lib/ai/client-ai-service";
import { isUserModel } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  APIKeys,
  Attachment,
  ChatMessage,
  ReasoningConfig,
  SendMessageParams,
  WebSearchCitation,
} from "@/types";

// Memory management constants
const MAX_PRIVATE_MESSAGES = 100;
const CLEANUP_THRESHOLD = 150;
const MEMORY_CLEANUP_INTERVAL = 5000; // 5 seconds

// Message utility functions (inlined from deleted file)
const messageUtils = {
  addMessage: (
    messages: ChatMessage[],
    message: ChatMessage
  ): ChatMessage[] => [...messages, message],
  updateMessage: (
    messages: ChatMessage[],
    messageId: string,
    updates: Partial<ChatMessage>
  ): ChatMessage[] =>
    messages.map(msg => (msg.id === messageId ? { ...msg, ...updates } : msg)),
  removeMessage: (messages: ChatMessage[], messageId: string): ChatMessage[] =>
    messages.filter(msg => msg.id !== messageId),
  createUserMessage: (
    content: string,
    attachments?: Attachment[]
  ): ChatMessage => ({
    id: `private_user_${Date.now()}`,
    role: "user",
    content,
    isMainBranch: true,
    attachments,
    createdAt: Date.now(),
  }),
  createAssistantMessage: (model?: string, provider?: string): ChatMessage => ({
    id: `private_assistant_${Date.now()}`,
    role: "assistant",
    content: "",
    isMainBranch: true,
    createdAt: Date.now(),
    model,
    provider,
  }),
};

interface UsePrivateChatOptions {
  onError?: (error: Error) => void;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
  initialPersonaId?: Id<"personas">;
  initialReasoningConfig?: ReasoningConfig;
}

export function usePrivateChat({
  onError,
  onMessagesChange,
  onStreamingStateChange,
  initialPersonaId,
  initialReasoningConfig,
}: UsePrivateChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [currentPersonaId, setCurrentPersonaId] =
    useState<Id<"personas"> | null>(initialPersonaId || null);
  const [currentReasoningConfig, setCurrentReasoningConfig] =
    useState<ReasoningConfig>(initialReasoningConfig || { enabled: false });

  // Call hooks directly - no dependency injection
  const getDecryptedApiKey = useAction(api.apiKeys.getDecryptedApiKey);
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = isUserModel(selectedModelRaw) ? selectedModelRaw : null;
  const { canSendMessage, user } = useUserDataContext();
  const convex = useConvex();

  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  // Memory management refs
  const lastCleanupTime = useRef<number>(Date.now());
  const messageCountRef = useRef<number>(0);

  // Memoize streaming state to avoid unnecessary re-renders
  const isStreaming = useMemo(
    () => streamingMessageId !== null,
    [streamingMessageId]
  );

  // Update streaming ref when state changes
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Update message count ref when messages change
  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  // Update currentPersonaId when initialPersonaId changes
  useEffect(() => {
    if (initialPersonaId !== undefined) {
      setCurrentPersonaId(initialPersonaId);
    }
  }, [initialPersonaId]);

  useEffect(() => {
    if (initialReasoningConfig !== undefined) {
      setCurrentReasoningConfig(initialReasoningConfig);
    }
  }, [initialReasoningConfig]);

  // Optimized message change notification
  const notifyMessagesChanged = useCallback(
    (newMessages: ChatMessage[]) => {
      onMessagesChange?.(newMessages);
    },
    [onMessagesChange]
  );

  // Optimized streaming state change notification
  const notifyStreamingStateChanged = useCallback(
    (streamingState: boolean) => {
      onStreamingStateChange?.(streamingState);
    },
    [onStreamingStateChange]
  );

  // Memory cleanup function
  const cleanupOldMessages = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCleanup = now - lastCleanupTime.current;

    // Only cleanup if enough time has passed and we have too many messages
    if (
      timeSinceLastCleanup > MEMORY_CLEANUP_INTERVAL &&
      messageCountRef.current > CLEANUP_THRESHOLD
    ) {
      setMessages(prevMessages => {
        // Keep the most recent messages
        const cleanedMessages = prevMessages.slice(-MAX_PRIVATE_MESSAGES);

        // If we removed messages, show a brief notification
        if (cleanedMessages.length < prevMessages.length) {
          const removedCount = prevMessages.length - cleanedMessages.length;
          toast.info("Memory optimization", {
            description: `Removed ${removedCount} old messages to maintain performance`,
            duration: 2000,
          });
        }

        return cleanedMessages;
      });

      lastCleanupTime.current = now;
    }
  }, []);

  // Centralized message update function with memory management
  const updateMessages = useCallback(
    (updater: (prevMessages: ChatMessage[]) => ChatMessage[]) => {
      setMessages(prevMessages => {
        const newMessages = updater(prevMessages);
        notifyMessagesChanged(newMessages);

        // Trigger cleanup check after state update
        setTimeout(cleanupOldMessages, 0);

        return newMessages;
      });
    },
    [notifyMessagesChanged, cleanupOldMessages]
  );

  // Proper cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreamingRef.current && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Periodic memory monitoring (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const interval = setInterval(() => {
        if (messageCountRef.current > MAX_PRIVATE_MESSAGES) {
          console.warn(
            `[PrivateChat] High message count detected: ${messageCountRef.current}. Consider cleanup.`
          );
        }
      }, 10000); // Check every 10 seconds in development

      return () => clearInterval(interval);
    }
  }, []);

  const sendMessage = useCallback(
    async (params: SendMessageParams): Promise<void> => {
      if (user?.isAnonymous) {
        toast.error("Sign in required", {
          description: "Sign in to use private chat.",
        });
        onError?.(new Error("Anonymous users cannot use private chat."));
        return;
      }
      const { content, attachments, personaId, reasoningConfig } = params;

      if (!(content.trim() || attachments?.length)) {
        return;
      }

      if (!canSendMessage) {
        const errorMsg =
          "Message limit reached. Please sign in to continue chatting.";
        toast.error("Cannot send message", { description: errorMsg });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!selectedModel) {
        const errorMsg =
          "No model selected. Please select a model in the model picker to send messages.";
        toast.error("Cannot send message", { description: errorMsg });
        throw new Error(errorMsg);
      }

      // Update current persona ID if a persona is being used
      if (personaId !== undefined) {
        setCurrentPersonaId(personaId);
      }

      // Resolve persona prompt if needed
      let resolvedPersonaPrompt = null;
      const effectivePersonaId = personaId || currentPersonaId;
      if (effectivePersonaId) {
        try {
          const persona = await convex.query(api.personas.get, {
            id: effectivePersonaId,
          });
          resolvedPersonaPrompt = persona?.prompt || null;
        } catch {
          // Silently ignore persona resolution errors
        }
      }

      if (reasoningConfig !== undefined) {
        setCurrentReasoningConfig(reasoningConfig);
      }
      const effectiveReasoningConfig =
        reasoningConfig || currentReasoningConfig;

      const userMessage = messageUtils.createUserMessage(content, attachments);
      const assistantMessage = messageUtils.createAssistantMessage(
        selectedModel.modelId,
        selectedModel.provider
      );

      // Add both messages at once to reduce re-renders
      updateMessages(prevMessages => {
        const withUser = messageUtils.addMessage(prevMessages, userMessage);
        return messageUtils.addMessage(withUser, assistantMessage);
      });

      setStreamingMessageId(assistantMessage.id);
      notifyStreamingStateChanged(true);

      try {
        setIsGenerating(true);

        const provider = selectedModel.provider as AIProviderType;
        const decryptedKey = await getDecryptedApiKey({ provider });

        if (!decryptedKey) {
          throw new Error(`No valid API key found for ${provider}`);
        }

        const apiKeys: APIKeys = {};
        apiKeys[provider as keyof APIKeys] = decryptedKey;

        // Get all messages except the empty assistant message we just created
        const messagesForAI = messages
          .concat([userMessage])
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

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await streamChat(
          {
            messages: messagesForAI,
            model: selectedModel,
            apiKeys,
            options: {
              reasoningConfig: effectiveReasoningConfig?.enabled
                ? effectiveReasoningConfig
                : undefined,
            },
            callbacks: {
              onContent: (chunk: string) => {
                accumulatedContent += chunk;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      content: accumulatedContent,
                    }
                  )
                );
              },
              onReasoning: (chunk: string) => {
                accumulatedReasoning += chunk;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      reasoning: accumulatedReasoning,
                    }
                  )
                );
              },
              onCitations: (newCitations: WebSearchCitation[]) => {
                citations = newCitations;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      citations,
                    }
                  )
                );
              },
              onFinish: (finishReason: string) => {
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      metadata: {
                        finishReason,
                      },
                    }
                  )
                );
                setStreamingMessageId(null);
                notifyStreamingStateChanged(false);
              },
              onError: (error: Error) => {
                throw error;
              },
            },
          },
          abortController
        );
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
        updateMessages(prevMessages =>
          messageUtils.removeMessage(prevMessages, assistantMessage.id)
        );
        setStreamingMessageId(null);
        notifyStreamingStateChanged(false);

        const errorMessage =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error("Failed to send message", { description: errorMessage });
        onError?.(error as Error);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      messages,
      selectedModel,
      canSendMessage,
      convex,
      getDecryptedApiKey,
      onError,
      updateMessages,
      notifyStreamingStateChanged,
      currentPersonaId,
      currentReasoningConfig,
      user?.isAnonymous,
    ]
  );

  const stopGeneration = useCallback((): void => {
    abortControllerRef.current?.abort();

    // Immediately mark the message as stopped for UI feedback
    if (streamingMessageId) {
      updateMessages(prevMessages =>
        messageUtils.updateMessage(prevMessages, streamingMessageId, {
          metadata: {
            finishReason: "stop",
            stopped: true,
          },
        })
      );
    }

    setStreamingMessageId(null);
    notifyStreamingStateChanged(false);
  }, [streamingMessageId, updateMessages, notifyStreamingStateChanged]);

  const deleteMessage = useCallback(
    (messageId: string): Promise<void> => {
      updateMessages(prevMessages =>
        messageUtils.removeMessage(prevMessages, messageId)
      );
      return Promise.resolve();
    },
    [updateMessages]
  );

  const editMessage = useCallback(
    (messageId: string, content: string): Promise<void> => {
      updateMessages(prevMessages =>
        messageUtils.updateMessage(prevMessages, messageId, {
          content,
        })
      );
      return Promise.resolve();
    },
    [updateMessages]
  );

  const retryUserMessage = useCallback(
    async (messageId: string): Promise<void> => {
      if (user?.isAnonymous) {
        toast.error("Sign in required", {
          description: "Sign in to use private chat.",
        });
        onError?.(new Error("Anonymous users cannot use private chat."));
        return;
      }
      // Find the message index
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        toast.error("Cannot retry message", {
          description: "Message not found",
        });
        return;
      }

      const targetMessage = messages[messageIndex];
      if (targetMessage.role !== "user") {
        toast.error("Cannot retry message", {
          description: "Can only retry user messages",
        });
        return;
      }

      // Remove this message and all messages after it
      updateMessages(prevMessages => prevMessages.slice(0, messageIndex));

      // Re-send the message
      await sendMessage({
        content: targetMessage.content,
        attachments: targetMessage.attachments,
        personaId: null,
        reasoningConfig: undefined,
      });
    },
    [messages, updateMessages, sendMessage, onError, user?.isAnonymous]
  );

  const retryAssistantMessage = useCallback(
    async (messageId: string): Promise<void> => {
      if (user?.isAnonymous) {
        toast.error("Sign in required", {
          description: "Sign in to use private chat.",
        });
        onError?.(new Error("Anonymous users cannot use private chat."));
        return;
      }
      // Find the message index
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        toast.error("Cannot retry message", {
          description: "Message not found",
        });
        return;
      }

      const targetMessage = messages[messageIndex];
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

      const previousUserMessage = messages[previousUserMessageIndex];
      if (previousUserMessage.role !== "user") {
        toast.error("Cannot retry message", {
          description: "Previous message is not a user message",
        });
        return;
      }

      // Remove the assistant message and all messages after it
      updateMessages(prevMessages => prevMessages.slice(0, messageIndex));

      if (!canSendMessage) {
        const errorMsg =
          "Message limit reached. Please sign in to continue chatting.";
        toast.error("Cannot retry message", { description: errorMsg });
        onError?.(new Error(errorMsg));
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

      updateMessages(prevMessages =>
        messageUtils.addMessage(prevMessages, assistantMessage)
      );
      setStreamingMessageId(assistantMessage.id);
      notifyStreamingStateChanged(true);

      try {
        setIsGenerating(true);

        const provider = selectedModel.provider as AIProviderType;
        const decryptedKey = await getDecryptedApiKey({ provider });

        if (!decryptedKey) {
          throw new Error(`No valid API key found for ${provider}`);
        }

        const apiKeys: APIKeys = {};
        apiKeys[provider as keyof APIKeys] = decryptedKey;

        // Get all messages up to and including the previous user message
        const messagesForAI = messages
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

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await streamChat(
          {
            messages: messagesForAI,
            model: selectedModel,
            apiKeys,
            options: {},
            callbacks: {
              onContent: (chunk: string) => {
                accumulatedContent += chunk;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      content: accumulatedContent,
                    }
                  )
                );
              },
              onReasoning: (chunk: string) => {
                accumulatedReasoning += chunk;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      reasoning: accumulatedReasoning,
                    }
                  )
                );
              },
              onCitations: (newCitations: WebSearchCitation[]) => {
                citations = newCitations;
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      citations,
                    }
                  )
                );
              },
              onFinish: (finishReason: string) => {
                updateMessages(prevMessages =>
                  messageUtils.updateMessage(
                    prevMessages,
                    assistantMessage.id,
                    {
                      metadata: {
                        finishReason,
                      },
                    }
                  )
                );
                setStreamingMessageId(null);
                notifyStreamingStateChanged(false);
              },
              onError: (error: Error) => {
                throw error;
              },
            },
          },
          abortController
        );
      } catch (error) {
        // Check if this was a manual stop
        if (
          error instanceof Error &&
          (error.message === "StoppedByUser" ||
            error.name === "AbortError" ||
            error.message.includes("AbortError"))
        ) {
          return;
        }

        updateMessages(prevMessages =>
          messageUtils.removeMessage(prevMessages, assistantMessage.id)
        );
        setStreamingMessageId(null);
        notifyStreamingStateChanged(false);

        const errorMessage =
          error instanceof Error ? error.message : "Failed to retry message";
        toast.error("Failed to retry message", { description: errorMessage });
        onError?.(error as Error);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      messages,
      selectedModel,
      canSendMessage,
      onError,
      notifyStreamingStateChanged,
      updateMessages,
      getDecryptedApiKey,
      user?.isAnonymous,
    ]
  );

  return {
    messages,
    isLoading: isGenerating,
    isStreaming,
    currentPersonaId,
    currentReasoningConfig,
    sendMessage,
    stopGeneration,
    deleteMessage,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
  };
}
