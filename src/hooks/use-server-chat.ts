import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { mapPollyModelToProvider } from "@shared/constants";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { cleanAttachmentsForConvex } from "@/lib/utils";
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
  onInputClear?: () => void;
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
  onInputClear,
}: UseServerChatOptions) {
  const { canSendMessage, user } = useUserDataContext();
  const convex = useConvex();

  // Get selected model and provider
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = useMemo(
    () => selectedModelRaw ?? get(CACHE_KEYS.selectedModel, null),
    [selectedModelRaw]
  );
  const model = selectedModel?.modelId;
  const provider = useMemo(() => {
    if (!selectedModel) {
      return undefined;
    }

    // Use the actual provider from the selected model
    const actualProvider = selectedModel.provider;

    // If it's a Polly model, map to the actual provider
    if (actualProvider === "polly") {
      return mapPollyModelToProvider(model || "") as
        | "openai"
        | "anthropic"
        | "google"
        | "openrouter";
    }

    // Otherwise use the provider directly
    return actualProvider as "openai" | "anthropic" | "google" | "openrouter";
  }, [selectedModel, model]);

  // Create conversation functionality
  const createConversationMutation = useMutation(
    api.conversations.createConversation
  );
  const startStreamingAction = useAction(api.conversations.startStreaming);
  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );

  // Consolidated conversation creation function
  const createConversation = useCallback(
    async ({
      firstMessage,
      sourceConversationId,
      personaId,
      attachments,
      reasoningConfig,
      contextSummary,
      shouldNavigate = true,
    }: CreateConversationParams & { shouldNavigate?: boolean }): Promise<
      ConversationId | undefined
    > => {
      if (!(model && provider)) {
        const errorMsg =
          "No model selected. Please select a model in the model picker to start a conversation.";
        toast.error("Cannot create conversation", {
          description: errorMsg,
        });
        onError?.(new Error(errorMsg));
        return undefined;
      }

      try {
        // Use createBranchingConversation action for branching conversations with context
        if (sourceConversationId && contextSummary) {
          const result = await createBranchingConversationAction({
            userId: user?._id,
            firstMessage,
            sourceConversationId,
            personaId: personaId || undefined,
            attachments: cleanAttachmentsForConvex(attachments),
            useWebSearch: true,
            reasoningConfig:
              reasoningConfig?.enabled && reasoningConfig.maxTokens
                ? {
                    enabled: reasoningConfig.enabled,
                    effort: reasoningConfig.effort || "medium",
                    maxTokens: reasoningConfig.maxTokens,
                  }
                : undefined,
            contextSummary,
          });

          // Navigate immediately when conversation is created and navigation is requested
          if (
            result?.conversationId &&
            shouldNavigate &&
            onConversationCreate
          ) {
            onConversationCreate(result.conversationId);
          }

          // Start streaming in the background if model and provider are provided
          if (result?.conversationId && model && provider) {
            // Get the assistant message ID from the conversation
            const conversation = await convex.query(api.conversations.get, {
              id: result.conversationId,
            });

            if (conversation) {
              const messages = await convex.query(api.messages.list, {
                conversationId: result.conversationId,
              });

              const assistantMessage = Array.isArray(messages)
                ? messages.find(
                    (msg: { role: string }) => msg.role === "assistant"
                  )
                : messages.page.find(
                    (msg: { role: string }) => msg.role === "assistant"
                  );

              if (assistantMessage) {
                startStreamingAction({
                  conversationId: result.conversationId,
                  assistantMessageId: assistantMessage._id,
                  model,
                  provider,
                  enableWebSearch: true,
                  reasoningConfig:
                    reasoningConfig?.enabled && reasoningConfig.maxTokens
                      ? {
                          enabled: reasoningConfig.enabled,
                          effort: reasoningConfig.effort || "medium",
                          maxTokens: reasoningConfig.maxTokens,
                        }
                      : undefined,
                }).catch((error: Error) => {
                  // Log error but don't fail the conversation creation
                  console.error("Failed to start streaming:", error);
                  onError?.(error);
                });
              }
            }
          }

          return result?.conversationId;
        }

        // Use regular create mutation for normal conversations
        const result = await createConversationMutation({
          title: "New Conversation",
          firstMessage,
          sourceConversationId,
          personaId: personaId || undefined,
          attachments: cleanAttachmentsForConvex(attachments),
          reasoningConfig:
            reasoningConfig?.enabled && reasoningConfig.maxTokens
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort || "medium",
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
          model,
          provider,
          useWebSearch: true,
        });

        // Start streaming in the background if model and provider are provided
        if (result && model && provider) {
          startStreamingAction({
            conversationId: result.conversationId,
            assistantMessageId: result.assistantMessageId,
            model,
            provider,
            enableWebSearch: true,
            reasoningConfig:
              reasoningConfig?.enabled && reasoningConfig.maxTokens
                ? {
                    enabled: reasoningConfig.enabled,
                    effort: reasoningConfig.effort || "medium",
                    maxTokens: reasoningConfig.maxTokens,
                  }
                : undefined,
          }).catch((error: Error) => {
            // Log error but don't fail the conversation creation
            console.error("Failed to start streaming:", error);
            onError?.(error);
          });
        }

        return result?.conversationId;
      } catch (error) {
        console.error("Failed to create conversation:", {
          error: error instanceof Error ? error.message : String(error),
          model,
          provider,
          hasUser: !!user,
          userId: user?._id,
        });

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to create conversation";
        toast.error("Failed to create conversation", {
          description: errorMessage,
        });
        onError?.(error as Error);
        return undefined;
      }
    },
    [
      onError,
      model,
      provider,
      startStreamingAction,
      createConversationMutation,
      user?._id,
      createBranchingConversationAction,
      onConversationCreate,
      convex.query,
      user,
    ]
  );

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

  // Use regular mutation for message deletion
  const deleteMessageMutation = useMutation(api.messages.remove);

  // State management - combine all loading states
  const isGenerating = useMemo(
    () => isSendingFollowUp || isRetrying || isEditing || isStopping,
    [isSendingFollowUp, isRetrying, isEditing, isStopping]
  );

  // Track if we've attempted to resume for each conversation
  const attemptedResumeMap = useRef<Map<string, boolean>>(new Map());

  // Clear attempted resume tracking when conversation changes
  useEffect(() => {
    if (conversationId && !attemptedResumeMap.current.has(conversationId)) {
      attemptedResumeMap.current.clear();
    }
  }, [conversationId]);

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
        // Validate model and provider are available
        if (!(model && provider)) {
          const errorMsg =
            "No model selected. Please select a model in the model picker to send messages.";
          toast.error("Cannot send message", {
            description: errorMsg,
          });
          throw new Error(errorMsg);
        }

        // Create new conversation if needed
        if (!conversationId) {
          const createdConversationId = await createConversation({
            firstMessage: content,
            sourceConversationId: undefined,
            personaId,
            attachments,
          });
          if (!createdConversationId) {
            throw new Error("Failed to create conversation");
          }

          if (onConversationCreate && createdConversationId) {
            onConversationCreate(createdConversationId);
            return;
          }
        }

        await sendFollowUpMessage({
          conversationId: conversationId as Id<"conversations">,
          content,
          attachments: cleanAttachmentsForConvex(attachments),
          model,
          provider,
          reasoningConfig: reasoningConfig
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort || "medium",
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
        });
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
      onConversationCreate,
      sendFollowUpMessage,
      model,
      provider,
    ]
  );

  const generateConversationSummaryAction = useAction(
    api.conversationSummary.generateConversationSummary
  );

  const generateConversationSummary = useCallback(
    async (conversationId: ConversationId): Promise<string | null> => {
      try {
        const summary = await generateConversationSummaryAction({
          conversationId,
          maxTokens: 150,
        });
        return summary;
      } catch {
        return null;
      }
    },
    [generateConversationSummaryAction]
  );

  // Consolidated function for sending messages to new conversations
  const sendMessageToNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate = true,
      attachments?: Attachment[],
      contextSummary?: string,
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
        // Generate summary if we have a current conversation and no context summary
        let finalContextSummary = contextSummary;
        if (conversationId && !contextSummary) {
          try {
            const summary = await generateConversationSummary(conversationId);
            finalContextSummary = summary || undefined;
          } catch (error) {
            console.error("Failed to generate summary:", error);
          }
        }

        const newConversationId = await createConversation({
          firstMessage: content,
          sourceConversationId: sourceConversationId || conversationId,
          personaId,
          attachments,
          reasoningConfig,
          contextSummary: finalContextSummary || undefined,
          shouldNavigate,
        });

        if (!newConversationId) {
          throw new Error("Failed to create conversation");
        }

        // Clear input if conversation creation was successful
        onInputClear?.();

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
      conversationId,
      generateConversationSummary,
      onInputClear,
    ]
  );

  const retryUserMessage = useCallback(
    async (
      messageId: string,
      modelId?: string,
      providerId?: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      const retryModel = modelId || model;
      const retryProvider = providerId || provider;

      if (!(conversationId && retryModel && retryProvider)) {
        return;
      }

      try {
        await retryFromMessage({
          conversationId,
          messageId: messageId as Id<"messages">,
          retryType: "user",
          model: retryModel,
          provider: retryProvider,
          reasoningConfig: reasoningConfig
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort || "medium",
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to retry message";
        toast.error("Failed to retry message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, retryFromMessage, onError, model, provider]
  );

  const retryAssistantMessage = useCallback(
    async (
      messageId: string,
      modelId?: string,
      providerId?: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      const retryModel = modelId || model;
      const retryProvider = providerId || provider;

      if (!(conversationId && retryModel && retryProvider)) {
        return;
      }

      try {
        await retryFromMessage({
          conversationId,
          messageId: messageId as Id<"messages">,
          retryType: "assistant",
          model: retryModel,
          provider: retryProvider,
          reasoningConfig: reasoningConfig
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort || "medium",
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to retry message";
        toast.error("Failed to retry message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, retryFromMessage, onError, model, provider]
  );

  const editMessageContent = useCallback(
    async (
      messageId: string,
      newContent: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!conversationId) {
        return;
      }

      try {
        await editMessage({
          conversationId,
          messageId: messageId as Id<"messages">,
          newContent,
          model: model || "",
          provider: provider || "",
          reasoningConfig: reasoningConfig
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort || "medium",
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to edit message";
        toast.error("Failed to edit message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [conversationId, editMessage, onError, model, provider]
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
        await deleteMessageMutation({
          id: messageId as Id<"messages">,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to delete message";
        toast.error("Failed to delete message", {
          description: errorMessage,
        });
        onError?.(error as Error);
      }
    },
    [deleteMessageMutation, onError]
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
