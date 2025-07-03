import { useCallback, useEffect, useRef } from "react";

import { useQuery } from "convex/react";
import { toast } from "sonner";

import { useThinking } from "@/providers/thinking-provider";
import {
  type Attachment,
  type ChatMessage,
  type ConversationId,
  type ReasoningConfig,
} from "@/types";

import { useChatMessages } from "./use-chat-messages";
import { useCreateConversation } from "./use-conversations";
import { useSelectedModel } from "./use-selected-model";
import { useUser } from "./use-user";
import { useConvexActionOptimized } from "./use-convex-cache";
import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

// Helper function to clean attachments for Convex by removing fields not in the schema
function cleanAttachmentsForConvex(attachments?: Attachment[]) {
  if (!attachments) return undefined;

  return attachments.map(attachment => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mimeType, ...cleanAttachment } = attachment;
    return cleanAttachment;
  });
}

type UseChatOptions = {
  conversationId?: ConversationId;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
};

export function useChat({
  conversationId,
  onError,
  onConversationCreate,
}: UseChatOptions) {
  const { user, isLoading: userLoading, canSendMessage } = useUser();
  const { createConversation } = useCreateConversation();
  const { setIsThinking } = useThinking();

  // Use specialized hooks
  const chatMessages = useChatMessages({
    conversationId,
    onError,
  });

  // Query conversation to get isStreaming state
  const conversation = useQuery(
    api.conversations.get,
    conversationId ? { id: conversationId } : "skip"
  );

  // Use optimized action hooks for better error handling and consistency
  const { executeAsync: sendFollowUpMessage, isLoading: isSendingFollowUp } =
    useConvexActionOptimized(api.conversations.sendFollowUpMessage, {
      onError: error => {
        console.error("Failed to send follow-up message:", error);
        onError?.(error);
      },
      invalidateQueries: ["messages", "conversations"],
      dispatchEvents: ["message-sent"],
    });

  const { executeAsync: retryFromMessage, isLoading: isRetrying } =
    useConvexActionOptimized(api.conversations.retryFromMessage, {
      onError: error => {
        console.error("Failed to retry message:", error);
        onError?.(error);
      },
      invalidateQueries: ["messages"],
      dispatchEvents: ["message-retried"],
    });

  const { executeAsync: editMessage, isLoading: isEditing } =
    useConvexActionOptimized(api.conversations.editMessage, {
      onError: error => {
        console.error("Failed to edit message:", error);
        onError?.(error);
      },
      invalidateQueries: ["messages"],
      dispatchEvents: ["message-edited"],
    });

  const { executeAsync: stopGeneration, isLoading: isStopping } =
    useConvexActionOptimized(api.conversations.stopGeneration, {
      onError: error => {
        console.error("Failed to stop generation:", error);
        onError?.(error);
      },
      invalidateQueries: ["conversations"],
      dispatchEvents: ["generation-stopped"],
    });

  const { executeAsync: resumeConversation, isLoading: isResuming } =
    useConvexActionOptimized(api.conversations.resumeConversation, {
      onError: error => {
        console.error("Failed to resume conversation:", error);
        onError?.(error);
      },
      invalidateQueries: ["messages", "conversations"],
      dispatchEvents: ["conversation-resumed"],
    });

  const { selectedModel } = useSelectedModel();

  // State management - combine all loading states
  const isGenerating =
    isSendingFollowUp || isRetrying || isEditing || isStopping || isResuming;

  // Track if we've attempted to resume for each conversation
  const attemptedResumeMap = useRef<Map<string, boolean>>(new Map());

  // Clear attempted resume tracking when conversation changes
  const prevConversationIdRef = useRef(conversationId);
  if (conversationId !== prevConversationIdRef.current) {
    prevConversationIdRef.current = conversationId;
  }

  const withLoadingState = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        setIsThinking(true);
        return await operation();
      } finally {
        setIsThinking(false);
      }
    },
    [setIsThinking]
  );

  // Auto-resume incomplete conversations
  useEffect(() => {
    if (
      conversation &&
      conversation.isStreaming &&
      conversationId &&
      !attemptedResumeMap.current.get(conversationId)
    ) {
      attemptedResumeMap.current.set(conversationId, true);

      const handleResume = async () => {
        try {
          await resumeConversation({ conversationId });
        } catch {
          // Error handling is done in the optimized hook
        }
      };

      handleResume();
    }
  }, [conversation, conversationId, resumeConversation]);

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaPrompt?: string | null,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!content.trim() && !attachments?.length) {
        return;
      }

      if (!canSendMessage) {
        const errorMsg =
          "Message limit reached. Please sign in to continue chatting.";
        toast.error("Cannot send message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!user && userLoading) {
        setTimeout(() => sendMessage(content, attachments), 200);
        return;
      }

      try {
        // Create new conversation if needed
        if (!conversationId) {
          await withLoadingState(async () => {
            const newConversationId = await createConversation({
              firstMessage: content,
              sourceConversationId: undefined,
              personaId,
              userId: user?._id,
              attachments,
              useWebSearch,
              personaPrompt,
            });
            if (!newConversationId) {
              throw new Error("Failed to create conversation");
            }

            // For new conversations, navigate immediately - the Convex action handles the assistant response
            if (onConversationCreate) {
              onConversationCreate(newConversationId);
              return;
            }
          });

          return;
        }

        // For existing conversations, use the centralized Convex action
        if (selectedModel) {
          await withLoadingState(() =>
            sendFollowUpMessage({
              conversationId,
              content,
              attachments: cleanAttachmentsForConvex(attachments),
              useWebSearch,
              model: selectedModel.modelId,
              provider: selectedModel.provider,
              reasoningConfig: reasoningConfig
                ? {
                    enabled: reasoningConfig.enabled,
                    effort: reasoningConfig.effort,
                    maxTokens: reasoningConfig.maxTokens,
                  }
                : undefined,
            })
          );
        } else {
          const errorMsg =
            "No model selected. Please select a model in the model picker to send messages.";
          toast.error("Cannot send message", {
            description: errorMsg,
          });
          throw new Error(errorMsg);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error("Failed to send message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [
      canSendMessage,
      onError,
      user,
      userLoading,
      conversationId,
      createConversation,
      withLoadingState,
      onConversationCreate,
      selectedModel,
      sendFollowUpMessage,
    ]
  );

  const sendMessageToNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate = true,
      attachments?: Attachment[],
      contextSummary?: string,
      sourceConversationId?: ConversationId,
      personaPrompt?: string | null,
      personaId?: Id<"personas"> | null
    ) => {
      if (!content.trim() && !attachments?.length) {
        return;
      }

      if (!canSendMessage) {
        const errorMsg =
          "Message limit reached. Please sign in to continue chatting.";
        toast.error("Cannot send message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!user && userLoading) {
        setTimeout(
          () =>
            sendMessageToNewConversation(content, shouldNavigate, attachments),
          200
        );
        return;
      }

      try {
        const newConversationId = await withLoadingState(async () => {
          const conversationId = await createConversation({
            firstMessage: content,
            sourceConversationId,
            personaId,
            userId: user?._id,
            attachments,
            useWebSearch: false,
            personaPrompt,
            contextSummary,
          });
          if (!conversationId) {
            throw new Error("Failed to create conversation");
          }

          if (shouldNavigate && onConversationCreate) {
            onConversationCreate(conversationId);
          }

          return conversationId;
        });

        return newConversationId;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to create new conversation";
        toast.error("Failed to create conversation", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [
      canSendMessage,
      onError,
      user,
      userLoading,
      createConversation,
      withLoadingState,
      onConversationCreate,
    ]
  );

  const retryUserMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId || !selectedModel) {
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessage({
            conversationId,
            messageId,
            retryType: "user",
            model: selectedModel.modelId,
            provider: selectedModel.provider,
          })
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to retry message";
        toast.error("Failed to retry message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, selectedModel, retryFromMessage, withLoadingState, onError]
  );

  const retryAssistantMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId || !selectedModel) {
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessage({
            conversationId,
            messageId,
            retryType: "assistant",
            model: selectedModel.modelId,
            provider: selectedModel.provider,
          })
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to retry message";
        toast.error("Failed to retry message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, selectedModel, retryFromMessage, withLoadingState, onError]
  );

  const editMessageContent = useCallback(
    async (messageId: string, newContent: string) => {
      if (!conversationId || !selectedModel) {
        return;
      }

      try {
        await withLoadingState(() =>
          editMessage({
            conversationId,
            messageId,
            newContent,
            model: selectedModel.modelId,
            provider: selectedModel.provider,
          })
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to edit message";
        toast.error("Failed to edit message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, selectedModel, editMessage, withLoadingState, onError]
  );

  const stopGenerationAction = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    try {
      await stopGeneration({ conversationId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to stop generation";
      toast.error("Failed to stop generation", {
        description: errorMessage,
      });
      onError?.(error as Error);
    }
  }, [conversationId, stopGeneration, onError]);

  // Determine if conversation is streaming
  const isStreaming = conversation?.isStreaming || false;

  return {
    messages: chatMessages.messages,
    isLoading: chatMessages.isLoadingMessages,
    isGenerating,
    isStreaming,
    sendMessage,
    sendMessageToNewConversation,
    retryUserMessage,
    retryAssistantMessage,
    editMessage: editMessageContent,
    stopGeneration: stopGenerationAction,
  };
}
