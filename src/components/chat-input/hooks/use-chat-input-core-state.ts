import { useCallback, useEffect, useState } from "react";
import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useChatInputPreservation } from "@/hooks/use-chat-input-preservation";
import type { Attachment, ConversationId } from "@/types";

interface UseChatInputCoreStateProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
}

export function useChatInputCoreState({
  conversationId,
  hasExistingMessages = false,
}: UseChatInputCoreStateProps) {
  const { setChatInputState, getChatInputState, clearChatInputState } =
    useChatInputPreservation();

  const shouldUsePreservedState = conversationId && !hasExistingMessages;

  const [input, setInputState] = useState(() =>
    conversationId && shouldUsePreservedState
      ? getChatInputState(conversationId).input
      : ""
  );

  // Attachments from Zustand store
  const { attachments, setAttachments: setAttachmentsState } =
    useChatAttachments(conversationId);

  // Persona, temperature, reasoning moved to Zustand hooks; keep only input here

  // Preserve state changes
  useEffect(() => {
    if (!shouldUsePreservedState) {
      return;
    }

    setChatInputState(
      {
        input,
        // only preserve input
      },
      conversationId
    );
  }, [shouldUsePreservedState, setChatInputState, input, conversationId]);

  // Wrapped setters that also update preserved state
  const setInput = useCallback(
    (value: string) => {
      setInputState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ input: value }, conversationId);
      }
    },
    [shouldUsePreservedState, setChatInputState, conversationId]
  );

  const setAttachments = useCallback(
    (newValue: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      setAttachmentsState(newValue);
    },
    [setAttachmentsState]
  );

  const resetCoreState = useCallback(() => {
    setInput("");
    setAttachments([]);
    if (shouldUsePreservedState) {
      clearChatInputState();
    }
  }, [shouldUsePreservedState, clearChatInputState, setInput, setAttachments]);

  return {
    input,
    attachments,
    shouldUsePreservedState,
    setInput,
    setAttachments,
    resetCoreState,
  };
}
