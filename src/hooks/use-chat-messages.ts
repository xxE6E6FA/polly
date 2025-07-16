import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Doc } from "convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useUserData } from "@/hooks/use-user-data";
import { ROUTES } from "@/lib/routes";
import { hasPageArray } from "@/lib/type-guards";
import type { ChatMessage, ConversationId } from "@/types";

type UseChatMessagesOptions = {
  conversationId?: ConversationId;
  onError?: (error: Error) => void;
};

// Type guard for message metadata
function isMessageMetadata(x: unknown): x is {
  finishReason?: string;
  stopped?: boolean;
  tokenCount?: number;
  reasoningTokenCount?: number;
  duration?: number;
  searchQuery?: string;
  searchFeature?: string;
  searchCategory?: string;
  status?: "pending" | "error";
} {
  return x === null || x === undefined || typeof x === "object";
}

export function useChatMessages({
  conversationId,
  onError,
}: UseChatMessagesOptions) {
  const userData = useUserData();
  const user = userData?.user;
  const navigate = useNavigate();
  const dispatch = useCallback((eventName: string) => {
    window.dispatchEvent(new CustomEvent(eventName));
  }, []);
  const [pendingMessages, setPendingMessages] = useState<
    Map<string, ChatMessage>
  >(() => new Map());

  const convexMessages = usePersistentConvexQuery(
    "chat-messages",
    api.messages.list,
    conversationId ? { conversationId } : "skip"
  );

  const updateMessageContent = useMutation(api.messages.update);
  const deleteMessagesByIds = useMutation(api.messages.removeMultiple);
  const deleteConversation = useMutation(api.conversations.remove);

  const messages: ChatMessage[] = useMemo(() => {
    if (!convexMessages) {
      return Array.from(pendingMessages.values());
    }

    const messagesArray = Array.isArray(convexMessages)
      ? (convexMessages as Doc<"messages">[])
      : hasPageArray(convexMessages)
        ? (convexMessages.page as Doc<"messages">[])
        : [];

    const serverMessageContents = new Set(
      messagesArray.map((msg: Doc<"messages">) => `${msg.role}:${msg.content}`)
    );

    const filteredPendingMessages = Array.from(pendingMessages.values()).filter(
      pendingMsg => {
        const key = `${pendingMsg.role}:${pendingMsg.content}`;
        return !serverMessageContents.has(key);
      }
    );

    const combinedMessages: ChatMessage[] = [
      ...messagesArray.map(
        (msg: Doc<"messages">): ChatMessage => ({
          id: msg._id,
          role: msg.role as ChatMessage["role"],
          content: msg.content,
          reasoning: msg.reasoning,
          model: msg.model,
          provider: msg.provider,
          parentId: msg.parentId,
          isMainBranch: msg.isMainBranch,
          sourceConversationId: msg.sourceConversationId as
            | ConversationId
            | undefined,
          useWebSearch: msg.useWebSearch,
          attachments: msg.attachments as ChatMessage["attachments"],
          citations: msg.citations as ChatMessage["citations"],
          metadata: isMessageMetadata(msg.metadata)
            ? (msg.metadata as ChatMessage["metadata"])
            : undefined,
          createdAt: msg.createdAt || msg._creationTime,
        })
      ),
      ...filteredPendingMessages,
    ];

    return combinedMessages.sort((a, b) => a.createdAt - b.createdAt);
  }, [convexMessages, pendingMessages]);

  const streamingMessageInfo = useMemo(() => {
    if (!convexMessages) {
      return null;
    }

    const messagesArray = Array.isArray(convexMessages)
      ? convexMessages
      : hasPageArray(convexMessages)
        ? convexMessages.page
        : [];

    const streamingMessage = messagesArray.find(
      (msg: Record<string, unknown>) => {
        const metadata = isMessageMetadata(msg.metadata) ? msg.metadata : null;
        return (
          msg.role === "assistant" &&
          !metadata?.finishReason &&
          !metadata?.stopped
        );
      }
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
          await deleteConversation({ id: conversationId });
          dispatch("conversations-changed");
        } else {
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
      onError,
      dispatch,
    ]
  );

  const isMessageStreaming = useCallback(
    (messageId: string, isGenerating: boolean) => {
      if (!convexMessages) {
        return false;
      }

      if (streamingMessageInfo && streamingMessageInfo.id === messageId) {
        return isGenerating;
      }

      const messagesArray = Array.isArray(convexMessages)
        ? convexMessages
        : hasPageArray(convexMessages)
          ? convexMessages.page
          : [];

      const message = messagesArray.find(
        (m: Record<string, unknown>) => m._id === messageId
      );

      if (!message) {
        return false;
      }

      const metadata = isMessageMetadata(message.metadata)
        ? message.metadata
        : null;
      return (
        message?.role === "assistant" && !metadata?.finishReason && isGenerating
      );
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
    isMessageStreaming,
  };
}
