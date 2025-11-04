import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Doc } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  convertServerMessage,
  extractMessagesArray,
  findStreamingMessage,
  isMessageStreaming,
} from "@/lib/chat/message-utils";
import { ROUTES } from "@/lib/routes";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ChatMessage, ConversationId } from "@/types";

type UseChatMessagesOptions = {
  conversationId?: ConversationId;
  onError?: (error: Error) => void;
};

export function useChatMessages({
  conversationId,
  onError,
}: UseChatMessagesOptions) {
  const { user } = useUserDataContext();
  const navigate = useNavigate();

  const [pendingMessages, setPendingMessages] = useState<
    Map<string, ChatMessage>
  >(() => new Map());

  const convexMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip"
  );

  const updateMessageContentAction = useMutation(api.messages.update);
  const deleteMessagesByIdsAction = useMutation(api.messages.removeMultiple);
  const deleteConversationAction = useMutation(api.conversations.remove);

  // Memoize expensive operations separately for better performance
  const messagesArray = useMemo(() => {
    return convexMessages ? extractMessagesArray(convexMessages) : [];
  }, [convexMessages]);

  const serverMessages = useMemo(() => {
    return messagesArray.map(convertServerMessage);
  }, [messagesArray]);

  const serverMessageKeys = useMemo(() => {
    return new Set(
      messagesArray.map((msg: Doc<"messages">) => `${msg.role}:${msg.content}`)
    );
  }, [messagesArray]);

  const pendingMessagesArray = useMemo(() => {
    return Array.from(pendingMessages.values());
  }, [pendingMessages]);

  const messages: ChatMessage[] = useMemo(() => {
    if (!convexMessages) {
      return pendingMessagesArray;
    }

    // Filter pending messages that aren't already on server
    const filteredPendingMessages = pendingMessagesArray.filter(pendingMsg => {
      const key = `${pendingMsg.role}:${pendingMsg.content}`;
      return !serverMessageKeys.has(key);
    });

    const combinedMessages: ChatMessage[] = [
      ...serverMessages,
      ...filteredPendingMessages,
    ];

    return combinedMessages.sort((a, b) => a.createdAt - b.createdAt);
  }, [convexMessages, serverMessages, serverMessageKeys, pendingMessagesArray]);

  const streamingMessageInfo = useMemo(() => {
    return findStreamingMessage(convexMessages);
  }, [convexMessages]);

  const deleteMessagesAfter = useCallback(
    async (fromIndex: number) => {
      const messagesToDelete = messages.slice(fromIndex);
      if (messagesToDelete.length > 0) {
        const idsToDelete = messagesToDelete
          .filter(m => m?.id)
          .map(m => m.id as Id<"messages">);
        if (idsToDelete.length > 0) {
          await deleteMessagesByIdsAction({ ids: idsToDelete });
        }
      }
    },
    [messages, deleteMessagesByIdsAction]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!(user?._id && conversationId)) {
        return;
      }

      try {
        await updateMessageContentAction({
          id: messageId as Id<"messages">,
          content: newContent,
        });
      } catch (error) {
        onError?.(error as Error);
      }
    },
    [user?._id, conversationId, updateMessageContentAction, onError]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!(user?._id && conversationId)) {
        return;
      }

      try {
        const visibleMessages = messages.filter(message => {
          if (message.role === "system") {
            return false;
          }
          if (message.role === "assistant") {
            return message.content || message.reasoning;
          }
          return true;
        });

        const remainingVisibleMessages = visibleMessages.filter(
          m => m.id !== messageId
        );
        const isLastVisibleMessage = remainingVisibleMessages.length === 0;

        if (isLastVisibleMessage) {
          navigate(ROUTES.HOME);
          await new Promise(resolve => setTimeout(resolve, 100));
          await deleteConversationAction({ id: conversationId });
        } else {
          await deleteMessagesByIdsAction({
            ids: [messageId as Id<"messages">],
          });
        }
      } catch (error) {
        onError?.(error as Error);
      }
    },
    [
      user?._id,
      conversationId,
      messages,
      navigate,
      onError,
      deleteMessagesByIdsAction,
      deleteConversationAction,
    ]
  );

  const isMessageStreamingCallback = useCallback(
    (messageId: string, isGenerating: boolean) => {
      if (!convexMessages) {
        return false;
      }

      if (streamingMessageInfo && streamingMessageInfo.id === messageId) {
        return isGenerating;
      }

      const messagesArray = extractMessagesArray(convexMessages);
      const message = messagesArray.find(m => m._id === messageId);

      if (!message) {
        return false;
      }

      return isMessageStreaming(message, isGenerating);
    },
    [convexMessages, streamingMessageInfo]
  );

  const addOptimisticMessage = useCallback((message: ChatMessage) => {
    setPendingMessages(prev => {
      const next = new Map(prev);
      next.set(String(message.id), message);
      return next;
    });
  }, []);

  const clearOptimisticMessages = useCallback(() => {
    setPendingMessages(new Map());
  }, []);

  useEffect(() => {
    clearOptimisticMessages();
  }, [clearOptimisticMessages]);

  return {
    messages,
    convexMessages,
    isLoadingMessages: !convexMessages,
    addOptimisticMessage,
    clearOptimisticMessages,
    deleteMessagesAfter,
    editMessage,
    deleteMessage,
    isMessageStreaming: isMessageStreamingCallback,
  };
}
