import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { useThinking } from "@/providers/thinking-provider";
import {
  type Attachment,
  type ChatMessage,
  type ConversationId,
} from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";

import { useChatMessages } from "./use-chat-messages";
import { useCreateConversation } from "./use-conversations";
import { useSelectedModel } from "./use-selected-model";
import { useUser } from "./use-user";
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
  const { createNewConversation } = useCreateConversation();
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

  // Centralized Convex actions
  const sendFollowUpMessageAction = useAction(
    api.conversations.sendFollowUpMessage
  );
  const retryFromMessageAction = useAction(api.conversations.retryFromMessage);
  const editMessageAction = useAction(api.conversations.editMessage);
  const stopGenerationAction = useAction(api.conversations.stopGeneration);
  const resumeConversationAction = useAction(
    api.conversations.resumeConversation
  );
  const selectedModel = useSelectedModel();
  const addMessage = useMutation(api.messages.create);

  // State management
  const [isGenerating, setIsGenerating] = useState(false);

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
        setIsGenerating(true);
        setIsThinking(true);
        return await operation();
      } finally {
        setIsGenerating(false);
        setIsThinking(false);
      }
    },
    [setIsThinking]
  );

  // Auto-resume conversation logic
  useEffect(() => {
    if (
      !conversationId ||
      !selectedModel ||
      attemptedResumeMap.current.get(conversationId) ||
      isGenerating
    ) {
      return;
    }

    const lastMessage =
      chatMessages.convexMessages?.[chatMessages.convexMessages.length - 1];
    if (chatMessages.convexMessages?.length && lastMessage?.role === "user") {
      attemptedResumeMap.current.set(conversationId, true);

      const startResponse = async () => {
        try {
          await withLoadingState(() =>
            resumeConversationAction({
              conversationId,
            })
          );
        } catch (error) {
          attemptedResumeMap.current.delete(conversationId);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to resume conversation";
          toast.error("Failed to resume conversation", {
            description: errorMessage,
          });
          onError?.(error as Error);
        }
      };

      startResponse();
    }
  }, [
    conversationId,
    chatMessages.convexMessages,
    selectedModel,
    isGenerating,
    resumeConversationAction,
    withLoadingState,
    onError,
  ]);

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
            const newConversationId = await createNewConversation({
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
            sendFollowUpMessageAction({
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

        // Check if it's a monthly limit error
        if (errorMessage.includes("Monthly Polly model limit reached")) {
          // Extract the limit from the error message if possible
          const limitMatch = errorMessage.match(/\((\d+) messages\)/);
          const limit = limitMatch ? parseInt(limitMatch[1]) : 500;

          toast.error("Monthly Polly Model Limit Reached", {
            description: `You've used all ${limit} free messages this month. Switch to your BYOK models for unlimited usage, or wait for next month's reset.`,
          });

          const limitError = new Error(errorMessage) as Error & {
            code?: string;
          };
          limitError.code = "MONTHLY_LIMIT_REACHED";
          onError?.(limitError);
          return;
        }

        // Generic error handling
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
      createNewConversation,
      onConversationCreate,
      selectedModel,
      sendFollowUpMessageAction,
      withLoadingState,
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
        // Use the new function that starts the assistant response immediately
        const newConversationId = await withLoadingState(async () => {
          const conversationId = await createNewConversation({
            firstMessage: content,
            sourceConversationId,
            personaId,
            userId: user?._id,
            attachments,
            useWebSearch: false, // Don't use web search for new conversations by default
            personaPrompt,
          });
          if (!conversationId) {
            throw new Error("Failed to create conversation");
          }

          // Add context message if provided or if branching from another conversation
          if (sourceConversationId) {
            await addMessage({
              conversationId,
              role: "context",
              content: contextSummary || "Branched from previous conversation",
              sourceConversationId,
              isMainBranch: true,
            });
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
      createNewConversation,
      addMessage,
      onConversationCreate,
      withLoadingState,
    ]
  );

  const regenerateMessage = useCallback(async () => {
    if (!conversationId) {
      const errorMsg = "No conversation found";
      toast.error("Cannot regenerate message", {
        description: errorMsg,
      });
      onError?.(new Error(errorMsg));
      return;
    }

    if (!selectedModel) {
      const errorMsg =
        "No model selected. Please select a model in the model picker to regenerate messages.";
      toast.error("Cannot regenerate message", {
        description: errorMsg,
      });
      onError?.(new Error(errorMsg));
      return;
    }

    // Find the last user message to retry from
    const lastUserMessage = chatMessages.convexMessages
      ?.filter(msg => msg.role === "user")
      .pop();

    if (!lastUserMessage) {
      const errorMsg = "No user message found to regenerate from";
      toast.error("Cannot regenerate message", {
        description: errorMsg,
      });
      onError?.(new Error(errorMsg));
      return;
    }

    try {
      await withLoadingState(() =>
        retryFromMessageAction({
          conversationId,
          messageId: lastUserMessage._id,
          retryType: "user",
          model: selectedModel.modelId,
          provider: selectedModel.provider,
        })
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to regenerate message";
      toast.error("Failed to regenerate message", {
        description: errorMessage,
      });
      onError?.(error as Error);
    }
  }, [
    conversationId,
    selectedModel,
    chatMessages.convexMessages,
    retryFromMessageAction,
    withLoadingState,
    onError,
  ]);

  const stopGeneration = useCallback(() => {
    // Immediately update UI state for instant feedback
    setIsGenerating(false);
    setIsThinking(false);

    if (conversationId) {
      // Fire and forget - don't wait for completion to avoid UI lag
      stopGenerationAction({
        conversationId,
      }).catch(error => {
        toast.error("Failed to stop generation", {
          description:
            error instanceof Error
              ? error.message
              : "Unable to stop message generation",
        });
        // Reset state on error
        setIsGenerating(true);
        setIsThinking(true);
      });
    }
  }, [conversationId, stopGenerationAction, setIsGenerating, setIsThinking]);

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!conversationId) {
        const errorMsg = "No conversation found";
        toast.error("Cannot edit message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!selectedModel) {
        const errorMsg =
          "No model selected. Please select a model in the model picker to edit messages.";
        toast.error("Cannot edit message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      try {
        await withLoadingState(() =>
          editMessageAction({
            conversationId,
            messageId: messageId as Id<"messages">,
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
    [
      conversationId,
      selectedModel,
      editMessageAction,
      withLoadingState,
      onError,
    ]
  );

  const retryUserMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) {
        const errorMsg = "No conversation found";
        toast.error("Cannot retry message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!selectedModel) {
        const errorMsg =
          "No model selected. Please select a model in the model picker to retry messages.";
        toast.error("Cannot retry message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessageAction({
            conversationId,
            messageId: messageId as Id<"messages">,
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
    [
      conversationId,
      selectedModel,
      retryFromMessageAction,
      withLoadingState,
      onError,
    ]
  );

  const retryAssistantMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) {
        const errorMsg = "No conversation found";
        toast.error("Cannot retry message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      if (!selectedModel) {
        const errorMsg =
          "No model selected. Please select a model in the model picker to retry messages.";
        toast.error("Cannot retry message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessageAction({
            conversationId,
            messageId: messageId as Id<"messages">,
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
    [
      conversationId,
      selectedModel,
      retryFromMessageAction,
      withLoadingState,
      onError,
    ]
  );

  const clearMessages = useCallback(() => {
    // Keep messages in Convex - could implement deletion if needed
  }, []);

  // Computed values
  const isStreamingInCurrentConversation = useMemo(() => {
    if (!conversationId) {
      return false;
    }

    // Check for any assistant message without a finish reason (active streaming)
    const streamingMessage = chatMessages.convexMessages?.find(
      msg =>
        msg.conversationId === conversationId &&
        msg.role === "assistant" &&
        !msg.metadata?.finishReason &&
        !msg.metadata?.stopped // Not explicitly stopped
    );

    // If we have a streaming message, we're definitely streaming
    if (streamingMessage) {
      return true;
    }

    // Fallback to conversation's isStreaming field for immediate feedback during start
    // This covers the case where we're about to start streaming but no assistant message exists yet
    return Boolean(conversation?.isStreaming);
  }, [conversationId, chatMessages.convexMessages, conversation?.isStreaming]);

  return {
    messages: chatMessages.messages,
    conversationId,
    isLoading: isGenerating,
    isLoadingMessages: chatMessages.isLoadingMessages,
    error: null,
    sendMessage,
    sendMessageToNewConversation,
    regenerateMessage,
    clearMessages,
    stopGeneration,
    editMessage,
    retryUserMessage,
    retryAssistantMessage,
    deleteMessage: chatMessages.deleteMessage,
    expectingStream: false,
    isStreaming: isStreamingInCurrentConversation,
  };
}
