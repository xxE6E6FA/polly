import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";
import { useChatInputPreservation } from "@/hooks/use-chat-input-preservation";
import { getDefaultReasoningConfig } from "@/lib/message-reasoning-utils";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

interface UseChatInputCoreStateProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
}

export function useChatInputCoreState({
  conversationId,
  hasExistingMessages = false,
  currentReasoningConfig,
  currentTemperature,
}: UseChatInputCoreStateProps) {
  const { setChatInputState, getChatInputState, clearChatInputState } =
    useChatInputPreservation();

  const shouldUsePreservedState = conversationId && !hasExistingMessages;

  const [input, setInputState] = useState(() =>
    conversationId && shouldUsePreservedState
      ? getChatInputState(conversationId).input
      : ""
  );

  const [attachments, setAttachmentsState] = useState<Attachment[]>(() =>
    conversationId && shouldUsePreservedState
      ? getChatInputState(conversationId).attachments
      : []
  );

  const [selectedPersonaId, setSelectedPersonaIdState] =
    useState<Id<"personas"> | null>(() =>
      conversationId && shouldUsePreservedState
        ? getChatInputState(conversationId).selectedPersonaId
        : null
    );

  const [reasoningConfig, setReasoningConfigState] = useState<ReasoningConfig>(
    () => {
      if (conversationId && shouldUsePreservedState) {
        return getChatInputState(conversationId).reasoningConfig;
      }
      return getDefaultReasoningConfig();
    }
  );

  const [temperature, setTemperatureState] = useState<number | undefined>(() =>
    conversationId && shouldUsePreservedState
      ? getChatInputState(conversationId).temperature
      : currentTemperature
  );

  // Sync reasoning config with current config when available
  useEffect(() => {
    if (conversationId && !shouldUsePreservedState) {
      setReasoningConfigState(getDefaultReasoningConfig());
    } else if (currentReasoningConfig && shouldUsePreservedState) {
      setReasoningConfigState(currentReasoningConfig);
    }
  }, [conversationId, shouldUsePreservedState, currentReasoningConfig]);

  // Preserve state changes
  useEffect(() => {
    if (!shouldUsePreservedState) {
      return;
    }

    setChatInputState(
      {
        selectedPersonaId,
        input,
        reasoningConfig,
        attachments,
        temperature,
      },
      conversationId
    );
  }, [
    shouldUsePreservedState,
    setChatInputState,
    selectedPersonaId,
    input,
    reasoningConfig,
    attachments,
    temperature,
    conversationId,
  ]);

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
      const value =
        typeof newValue === "function" ? newValue(attachments) : newValue;
      setAttachmentsState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ attachments: value }, conversationId);
      }
    },
    [shouldUsePreservedState, setChatInputState, conversationId, attachments]
  );

  const setSelectedPersonaId = useCallback(
    (value: Id<"personas"> | null) => {
      setSelectedPersonaIdState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ selectedPersonaId: value }, conversationId);
      }
    },
    [shouldUsePreservedState, setChatInputState, conversationId]
  );

  const setReasoningConfig = useCallback(
    (value: ReasoningConfig) => {
      setReasoningConfigState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ reasoningConfig: value }, conversationId);
      }
    },
    [shouldUsePreservedState, setChatInputState, conversationId]
  );

  const setTemperature = useCallback(
    (value: number | undefined) => {
      setTemperatureState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ temperature: value }, conversationId);
      }
    },
    [shouldUsePreservedState, setChatInputState, conversationId]
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
    selectedPersonaId,
    reasoningConfig,
    temperature,
    shouldUsePreservedState,
    setInput,
    setAttachments,
    setSelectedPersonaId,
    setReasoningConfig,
    setTemperature,
    resetCoreState,
  };
}
