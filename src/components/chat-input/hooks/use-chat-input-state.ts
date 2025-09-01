import { useCallback, useEffect } from "react";
import { useChatHistory } from "@/stores/chat-ui-store";
import type { ConversationId } from "@/types";
import { useChatInputCoreState } from "./use-chat-input-core-state";
import { useChatInputFullscreen } from "./use-chat-input-fullscreen";
import { useChatInputImageGenerationParams } from "./use-chat-input-image-generation-params";

interface UseChatInputStateProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
}

export function useChatInputState({
  conversationId,
  hasExistingMessages = false,
}: UseChatInputStateProps) {
  // Persona chip removed

  // Use focused hooks for different concerns
  const coreState = useChatInputCoreState({
    conversationId,
    hasExistingMessages,
  });

  const fullscreenState = useChatInputFullscreen();
  const history = useChatHistory(conversationId);
  const imageGenState = useChatInputImageGenerationParams();

  // Reset multiline state when starting a new conversation
  useEffect(() => {
    if (!conversationId && coreState.input.trim().length === 0) {
      fullscreenState.handleHeightChange(false);
    }
  }, [conversationId, coreState.input, fullscreenState.handleHeightChange]);

  // Force reset multiline state when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      fullscreenState.handleHeightChange(false);
    }
  }, [conversationId, fullscreenState.handleHeightChange]);

  // History navigation handlers that integrate with core state
  const handleHistoryNavigation = useCallback(() => {
    const prev = history.prev();
    if (prev != null) {
      coreState.setInput(prev);
      return true;
    }
    return false;
  }, [history, coreState.setInput]);

  const handleHistoryNavigationDown = useCallback(() => {
    const next = history.next();
    if (next != null) {
      coreState.setInput(next);
      return true;
    }
    return false;
  }, [history, coreState.setInput]);

  const handleInputChange = useCallback(
    (value: string) => {
      coreState.setInput(value);
    },
    [coreState.setInput]
  );

  // State reset handlers
  const resetInputState = useCallback(() => {
    coreState.resetCoreState();
    imageGenState.resetImageParams();
    history.resetIndex();
  }, [coreState, imageGenState, history]);

  const clearOnSend = useCallback(() => {
    // Clear view-only fullscreen/multiline on send
    fullscreenState.clearOnSend();
  }, [fullscreenState]);

  return {
    // Core state from focused hooks
    ...coreState,
    ...fullscreenState,
    history,
    ...imageGenState,

    // Additional state
    enabledImageModels: undefined,

    // Integrated handlers
    handleHistoryNavigation,
    handleHistoryNavigationDown,
    handleInputChange,
    resetInputState,
    clearOnSend,
  };
}
