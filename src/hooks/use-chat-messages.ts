import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { ROUTES } from "@/lib/routes";
import type { ChatMessage, ConversationId } from "@/types";
import { useEventDispatcher } from "./use-convex-cache";
import { useUser } from "./use-user";

type UseChatMessagesOptions = {
  conversationId?: ConversationId;
  onError?: (error: Error) => void;
};

export function useChatMessages({
  conversationId,
  onError,
}: UseChatMessagesOptions) {
  const { user } = useUser();
  const navigate = useNavigate();
  const { dispatch } = useEventDispatcher();

  const convexMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip"
  );

  const updateMessageContent = useMutation(api.messages.update);
  const deleteMessagesByIds = useMutation(api.messages.removeMultiple);
  const deleteConversation = useMutation(api.conversations.remove);

  // Convert Convex messages to ChatMessage format with memoization
  const messages: ChatMessage[] = useMemo(() => {
    if (!convexMessages) {
      return [];
    }

    const messagesArray = Array.isArray(convexMessages)
      ? convexMessages
      : convexMessages.page;

    return messagesArray.map(msg => ({
      id: msg._id,
      role: msg.role,
      content: msg.content,
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
      createdAt: msg.createdAt,
    }));
  }, [convexMessages]);

  // Cache streaming state computation to avoid recalculation
  const streamingMessageInfo = useMemo(() => {
    if (!convexMessages) {
      return null;
    }

    const messagesArray = Array.isArray(convexMessages)
      ? convexMessages
      : convexMessages.page;

    const streamingMessage = messagesArray.find(
      msg =>
        msg.role === "assistant" &&
        !msg.metadata?.finishReason &&
        !msg.metadata?.stopped
    );

    return streamingMessage
      ? { id: streamingMessage._id, isStreaming: true }
      : null;
  }, [convexMessages]);

  const deleteMessagesAfter = useCallback(
    async (fromIndex: number) => {
      const messagesToDelete = messages.slice(fromIndex);
      if (messagesToDelete.length > 0) {
        const idsToDelete = messagesToDelete
          .filter(m => m?.id)
          .map(m => m.id as Id<"messages">);
        if (idsToDelete.length > 0) {
          await deleteMessagesByIds({ ids: idsToDelete });
        }
      }
    },
    [messages, deleteMessagesByIds]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!(user?._id && conversationId)) {
        return;
      }

      try {
        await updateMessageContent({
          id: messageId as Id<"messages">,
          content: newContent,
        });
      } catch (error) {
        onError?.(error as Error);
      }
    },
    [user?._id, conversationId, updateMessageContent, onError]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!(user?._id && conversationId)) {
        return;
      }

      try {
        // Filter messages the same way as the UI does
        const visibleMessages = messages.filter(message => {
          // Skip system messages
          if (message.role === "system") {
            return false;
          }
          // Skip assistant messages without content or reasoning
          if (message.role === "assistant") {
            return message.content || message.reasoning;
          }
          // Include all other messages
          return true;
        });

        // Check if this is the last visible message
        const remainingVisibleMessages = visibleMessages.filter(
          m => m.id !== messageId
        );
        const isLastVisibleMessage = remainingVisibleMessages.length === 0;

        if (isLastVisibleMessage) {
          // Navigate away first to prevent error flash
          navigate(ROUTES.HOME);

          // Small delay to ensure navigation has started
          await new Promise(resolve => setTimeout(resolve, 100));

          // Then delete the conversation
          await deleteConversation({ id: conversationId });
          // Trigger cache invalidation via event
          dispatch("conversations-changed");
        } else {
          // Just delete the message
          await deleteMessagesByIds({ ids: [messageId as Id<"messages">] });
        }
      } catch (error) {
        onError?.(error as Error);
      }
    },
    [
      user?._id,
      conversationId,
      deleteMessagesByIds,
      deleteConversation,
      messages,
      navigate,
      onError, // Trigger cache invalidation via event
      dispatch,
    ]
  );

  const isMessageStreaming = useCallback(
    (messageId: string, isGenerating: boolean) => {
      if (!convexMessages) {
        return false;
      }

      // Use cached streaming info if available
      if (streamingMessageInfo && streamingMessageInfo.id === messageId) {
        return isGenerating;
      }

      const messagesArray = Array.isArray(convexMessages)
        ? convexMessages
        : convexMessages.page;

      const message = messagesArray.find(m => m._id === messageId);
      return (
        message?.role === "assistant" &&
        !message.metadata?.finishReason &&
        isGenerating
      );
    },
    [convexMessages, streamingMessageInfo]
  );

  return {
    messages,
    convexMessages,
    isLoadingMessages: !convexMessages,
    deleteMessagesAfter,
    editMessage,
    deleteMessage,
    isMessageStreaming,
  };
}
