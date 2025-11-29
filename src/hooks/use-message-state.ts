/**
 * Shared message state management utilities
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  convertServerMessages,
  findStreamingMessage,
  isMessageStreaming,
} from "@/lib/chat/message-utils";
import type { ChatMessage, ConversationId } from "@/types";

export function useMessageState(
  conversationId?: ConversationId,
  serverMessages?: unknown
) {
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Convert and sync server messages to local state
  const messages = useMemo(() => {
    if (conversationId && serverMessages) {
      return convertServerMessages(serverMessages);
    }
    return localMessages;
  }, [conversationId, serverMessages, localMessages]);

  // Handle loading state
  useEffect(() => {
    if (conversationId) {
      setIsLoading(!serverMessages);
    } else {
      // Private mode is never loading from server
      setIsLoading(false);
    }
  }, [conversationId, serverMessages]);

  // Check if any message is currently streaming
  const isStreaming = useMemo(() => {
    if (conversationId) {
      return !!findStreamingMessage(serverMessages);
    }

    return messages.some(m => isMessageStreaming(m, true));
  }, [conversationId, serverMessages, messages]);

  // Add message to local state (for private mode)
  const addMessage = useCallback((message: ChatMessage) => {
    setLocalMessages(prev => [...prev, message]);
  }, []);

  // Update message in local state (for private mode)
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      setLocalMessages(prev =>
        prev.map(msg => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  // Clear local messages (for private mode)
  const clearMessages = useCallback(() => {
    setLocalMessages([]);
  }, []);

  return {
    messages,
    setMessages: setLocalMessages,
    isLoading,
    isStreaming,
    addMessage,
    updateMessage,
    clearMessages,
  };
}
