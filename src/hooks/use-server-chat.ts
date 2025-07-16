import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { storeAnonymousUserId } from "@/lib/auth-utils";
import { isUserModel } from "@/lib/type-guards";
import { cleanAttachmentsForConvex } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  CreateConversationParams,
  ReasoningConfig,
} from "@/types";
import { useChatMessages } from "./use-chat-messages";

type UseServerChatOptions = {
  conversationId?: ConversationId;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
};

// A helper hook to wrap a Convex action with manual loading state
function useActionWithLoading<Action extends FunctionReference<"action">>(
  action: Action,
  options?: {
    onSuccess?: (result: Action["_returnType"]) => void;
    onError?: (error: Error) => void;
  }
): {
  execute: (
    args: Action["_args"]
  ) => Promise<Action["_returnType"] | undefined>;
  isLoading: boolean;
} {
  const [isLoading, setIsLoading] = useState(false);
  const actionFn = useAction(action);

  const execute = useCallback(
    async (args: Action["_args"]) => {
      setIsLoading(true);
      try {
        const result = await actionFn(args);
        options?.onSuccess?.(result);
        return result;
      } catch (error) {
        options?.onError?.(error as Error);
        throw error; // Re-throw so call sites can also handle it
      } finally {
        setIsLoading(false);
      }
    },
    [actionFn, options]
  );

  return { execute, isLoading };
}

export function useServerChat({
  conversationId,
  onError,
  onConversationCreate,
}: UseServerChatOptions) {
  const { canSendMessage, user } = useUserDataContext();
  const { setIsThinking } = useUI();
  const selectedModelRaw = usePersistentConvexQuery(
    "selected-model",
    api.userModels.getUserSelectedModel,
    {}
  );
  const selectedModel = isUserModel(selectedModelRaw) ? selectedModelRaw : null;

  // Create conversation functionality
  const { execute: createNewConversation } = useActionWithLoading(
    api.conversations.createNewConversation,
    {
      onSuccess: result => {
        if (result?.isNewUser) {
          storeAnonymousUserId(result.userId);
        }
      },
      onError: () => {
        toast.error("Failed to create conversation", {
          description: "Unable to create new conversation. Please try again.",
        });
      },
    }
  );

  const createConversation = useCallback(
    async ({
      firstMessage,
      sourceConversationId,
      personaId,
      userId,
      attachments,
      generateTitle = true,
      reasoningConfig,
    }: CreateConversationParams): Promise<ConversationId | undefined> => {
      const result = await createNewConversation({
        userId,
        firstMessage,
        sourceConversationId,
        personaId: personaId || undefined,
        attachments: cleanAttachmentsForConvex(attachments),
        generateTitle,
        reasoningConfig:
          reasoningConfig?.enabled && reasoningConfig.maxTokens
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort || "medium",
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
      });

      return result?.conversationId;
    },
    [createNewConversation]
  );

  // Use specialized hooks
  const chatMessages = useChatMessages({
    conversationId,
    onError,
  });

  // Query conversation to get isStreaming state
  const conversation = usePersistentConvexQuery<Doc<"conversations"> | null>(
    "server-chat-conversation",
    api.conversations.get,
    conversationId ? { id: conversationId } : "skip"
  );

  // Use action hooks with manual loading state
  const { execute: sendFollowUpMessage, isLoading: isSendingFollowUp } =
    useActionWithLoading(api.conversations.sendFollowUpMessage, {
      onError: (error: Error) => {
        console.error("Failed to send follow-up message:", error);
        onError?.(error);
      },
    });

  const { execute: retryFromMessage, isLoading: isRetrying } =
    useActionWithLoading(api.conversations.retryFromMessage, {
      onError: (error: Error) => {
        console.error("Failed to retry message:", error);
        onError?.(error);
      },
    });

  const { execute: editMessage, isLoading: isEditing } = useActionWithLoading(
    api.conversations.editMessage,
    {
      onError: (error: Error) => {
        console.error("Failed to edit message:", error);
        onError?.(error);
      },
    }
  );

  const { execute: stopGeneration, isLoading: isStopping } =
    useActionWithLoading(api.conversations.stopGeneration, {
      onError: (error: Error) => {
        console.error("Failed to stop generation:", error);
        onError?.(error);
      },
    });

  const { execute: resumeConversation, isLoading: isResuming } =
    useActionWithLoading(api.conversations.resumeConversation, {
      onError: (error: Error) => {
        console.error("Failed to resume conversation:", error);
        onError?.(error);
      },
    });

  // Use regular mutation for message deletion
  const deleteMessageMutation = useMutation(api.messages.remove);

  // State management - combine all loading states
  const isGenerating = useMemo(
    () =>
      isSendingFollowUp || isRetrying || isEditing || isStopping || isResuming,
    [isSendingFollowUp, isRetrying, isEditing, isStopping, isResuming]
  );

  // Track if we've attempted to resume for each conversation
  const attemptedResumeMap = useRef<Map<string, boolean>>(new Map());

  // Clear attempted resume tracking when conversation changes
  useEffect(() => {
    if (conversationId && !attemptedResumeMap.current.has(conversationId)) {
      attemptedResumeMap.current.clear();
    }
  }, [conversationId]);

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
      conversation?.isStreaming &&
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

  // Simple user readiness check
  const isUserReady = user !== null;

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!(content.trim() || attachments?.length)) {
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

      // Wait for user to be ready instead of recursive setTimeout
      if (!isUserReady) {
        const errorMsg = "User not ready. Please wait or try again.";
        toast.error("Cannot send message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
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
              model: selectedModel.modelId,
              provider: selectedModel.provider,
              reasoningConfig: reasoningConfig
                ? {
                    enabled: reasoningConfig.enabled,
                    effort: reasoningConfig.effort || "medium",
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
      isUserReady,
      conversationId,
      createConversation,
      withLoadingState,
      onConversationCreate,
      selectedModel,
      sendFollowUpMessage,
      user?._id,
    ]
  );

  const sendMessageToNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate = true,
      attachments?: Attachment[],
      sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!(content.trim() || attachments?.length)) {
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

      // Wait for user to be ready instead of recursive setTimeout
      if (!isUserReady) {
        const errorMsg = "User not ready. Please wait or try again.";
        toast.error("Cannot send message", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
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
            reasoningConfig,
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
      isUserReady,
      createConversation,
      withLoadingState,
      onConversationCreate,
      user?._id,
    ]
  );

  const retryUserMessage = useCallback(
    async (messageId: string, reasoningConfig?: ReasoningConfig) => {
      if (!(conversationId && selectedModel)) {
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessage({
            conversationId,
            messageId: messageId as Id<"messages">,
            retryType: "user",
            model: selectedModel.modelId,
            provider: selectedModel.provider,
            reasoningConfig: reasoningConfig
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort || "medium",
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
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
    async (messageId: string, reasoningConfig?: ReasoningConfig) => {
      if (!(conversationId && selectedModel)) {
        return;
      }

      try {
        await withLoadingState(() =>
          retryFromMessage({
            conversationId,
            messageId: messageId as Id<"messages">,
            retryType: "assistant",
            model: selectedModel.modelId,
            provider: selectedModel.provider,
            reasoningConfig: reasoningConfig
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort || "medium",
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
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
    async (
      messageId: string,
      newContent: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!(conversationId && selectedModel)) {
        return;
      }

      try {
        await withLoadingState(() =>
          editMessage({
            conversationId,
            messageId: messageId as Id<"messages">,
            newContent,
            model: selectedModel.modelId,
            provider: selectedModel.provider,
            reasoningConfig: reasoningConfig
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort || "medium",
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
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

  const deleteMessageAction = useCallback(
    async (messageId: string) => {
      try {
        await withLoadingState(() =>
          deleteMessageMutation({
            id: messageId as Id<"messages">,
          })
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to delete message";
        toast.error("Failed to delete message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [deleteMessageMutation, withLoadingState, onError]
  );

  // Determine if conversation is streaming
  const isStreaming = useMemo(
    () => conversation?.isStreaming,
    [conversation?.isStreaming]
  );

  return {
    messages: chatMessages.messages,
    addOptimisticMessage: chatMessages.addOptimisticMessage,
    clearOptimisticMessages: chatMessages.clearOptimisticMessages,
    isLoading: chatMessages.isLoadingMessages,
    isGenerating,
    isStreaming,
    sendMessage,
    sendMessageToNewConversation,
    retryUserMessage,
    retryAssistantMessage,
    editMessage: editMessageContent,
    stopGeneration: stopGenerationAction,
    deleteMessage: deleteMessageAction,
    createConversation,
  };
}
