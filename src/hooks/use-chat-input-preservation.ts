import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useRef } from "react";
import type { Attachment, ReasoningConfig } from "@/types";

interface ChatInputState {
  input: string;
  attachments: Attachment[];
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
}

const defaultChatInputState: ChatInputState = {
  input: "",
  attachments: [],
  selectedPersonaId: null,
  reasoningConfig: {
    enabled: false,
    effort: "medium",
  },
  temperature: undefined,
};

/**
 * Hook for preserving chat input state when navigating between regular and private chat.
 * Uses useRef to avoid causing re-renders when input changes.
 */
export function useChatInputPreservation() {
  const chatInputStateRef = useRef<ChatInputState>(defaultChatInputState);

  const setChatInputState = useCallback((state: Partial<ChatInputState>) => {
    chatInputStateRef.current = { ...chatInputStateRef.current, ...state };
  }, []);

  const getChatInputState = useCallback(() => {
    return chatInputStateRef.current;
  }, []);

  const clearChatInputState = useCallback(() => {
    chatInputStateRef.current = defaultChatInputState;
  }, []);

  return {
    setChatInputState,
    getChatInputState,
    clearChatInputState,
  };
}
