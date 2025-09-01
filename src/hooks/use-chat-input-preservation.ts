import { useCallback, useRef } from "react";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

interface ChatInputState {
  input: string;
  attachments: Attachment[];
  reasoningConfig: ReasoningConfig;
  temperature?: number;
}

const defaultChatInputState: ChatInputState = {
  input: "",
  attachments: [],
  reasoningConfig: {
    enabled: false,
    effort: "medium",
  },
  temperature: undefined,
};

/**
 * Hook for preserving chat input state when navigating between conversations.
 * Uses useRef to avoid causing re-renders when input changes.
 * Maintains separate state for each conversation and global state for new conversations.
 */
export function useChatInputPreservation() {
  // Global state for new conversations and fallback
  const globalStateRef = useRef<ChatInputState>(defaultChatInputState);

  // Per-conversation state storage
  const conversationStatesRef = useRef<Map<ConversationId, ChatInputState>>(
    new Map()
  );

  const setChatInputState = useCallback(
    (state: Partial<ChatInputState>, conversationId?: ConversationId) => {
      if (conversationId) {
        const currentState = conversationStatesRef.current.get(conversationId);
        if (currentState) {
          // Only update if there are actual changes
          const hasChanges = Object.keys(state).some(
            key =>
              currentState[key as keyof ChatInputState] !==
              state[key as keyof ChatInputState]
          );
          if (hasChanges) {
            conversationStatesRef.current.set(conversationId, {
              ...currentState,
              ...state,
            });
          }
        } else {
          conversationStatesRef.current.set(conversationId, {
            ...defaultChatInputState,
            ...state,
          });
        }
      } else {
        // Update global state - optimized to avoid unnecessary object creation
        const hasChanges = Object.keys(state).some(
          key =>
            globalStateRef.current[key as keyof ChatInputState] !==
            state[key as keyof ChatInputState]
        );
        if (hasChanges) {
          globalStateRef.current = { ...globalStateRef.current, ...state };
        }
      }
    },
    []
  );

  const getChatInputState = useCallback((conversationId?: ConversationId) => {
    if (conversationId && conversationStatesRef.current.has(conversationId)) {
      const state = conversationStatesRef.current.get(conversationId);
      return state || defaultChatInputState;
    }
    return globalStateRef.current;
  }, []);

  const clearChatInputState = useCallback((conversationId?: ConversationId) => {
    if (conversationId) {
      conversationStatesRef.current.delete(conversationId);
    } else {
      globalStateRef.current = defaultChatInputState;
    }
  }, []);

  const clearAllConversationStates = useCallback(() => {
    conversationStatesRef.current.clear();
    globalStateRef.current = defaultChatInputState;
  }, []);

  return {
    setChatInputState,
    getChatInputState,
    clearChatInputState,
    clearAllConversationStates,
  };
}
