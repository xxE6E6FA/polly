import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId, ReasoningConfig } from "@/types";
import { useChatInputCoreState } from "./use-chat-input-core-state";
import { useChatInputFullscreen } from "./use-chat-input-fullscreen";
import { useChatInputHistory } from "./use-chat-input-history";
import { useChatInputImageGenerationParams } from "./use-chat-input-image-generation-params";

interface UseChatInputStateProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
}

export function useChatInputState({
  conversationId,
  hasExistingMessages = false,
  currentReasoningConfig,
  currentTemperature,
}: UseChatInputStateProps) {
  const { user } = useUserDataContext();

  // Query enabled image models to check capabilities
  const enabledImageModels = useQuery(
    api.imageModels.getUserImageModels,
    user?._id ? {} : "skip"
  );

  // Persona chip width for layout
  const [personaChipWidth, setPersonaChipWidth] = useState<number>(0);

  // Use focused hooks for different concerns
  const coreState = useChatInputCoreState({
    conversationId,
    hasExistingMessages,
    currentReasoningConfig,
    currentTemperature,
  });

  const fullscreenState = useChatInputFullscreen();
  const historyState = useChatInputHistory();
  const imageGenState = useChatInputImageGenerationParams();

  // Reset multiline state when starting a new conversation
  useEffect(() => {
    if (!conversationId && coreState.input.trim().length === 0) {
      fullscreenState.handleHeightChange(false);
    }
  }, [conversationId, coreState.input, fullscreenState]);

  // Force reset multiline state when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      fullscreenState.handleHeightChange(false);
    }
  }, [conversationId, fullscreenState]);

  // History navigation handlers that integrate with core state
  const handleHistoryNavigation = useCallback(
    (userMessages: string[]) => {
      return historyState.handleHistoryNavigation(
        userMessages,
        coreState.input,
        coreState.setInput
      );
    },
    [historyState, coreState.input, coreState.setInput]
  );

  const handleHistoryNavigationDown = useCallback(
    (userMessages: string[]) => {
      return historyState.handleHistoryNavigationDown(
        userMessages,
        coreState.setInput
      );
    },
    [historyState, coreState.setInput]
  );

  const handleInputChange = useCallback(
    (value: string, userMessages: string[]) => {
      historyState.handleInputChange(value, userMessages, coreState.setInput);
    },
    [historyState, coreState.setInput]
  );

  // State reset handlers
  const resetInputState = useCallback(() => {
    coreState.resetCoreState();
    imageGenState.resetImageParams();
    historyState.resetHistory();
  }, [coreState, imageGenState, historyState]);

  // Memoized navigation props to prevent recreation
  const navigationProps = useMemo(
    () => ({
      onHistoryNavigation: handleHistoryNavigation,
      onHistoryNavigationDown: handleHistoryNavigationDown,
      onHeightChange: fullscreenState.handleHeightChange,
      isTransitioning: fullscreenState.isTransitioning,
    }),
    [
      handleHistoryNavigation,
      handleHistoryNavigationDown,
      fullscreenState.handleHeightChange,
      fullscreenState.isTransitioning,
    ]
  );

  return {
    // Core state from focused hooks
    ...coreState,
    ...fullscreenState,
    ...historyState,
    ...imageGenState,

    // Additional state
    personaChipWidth,
    enabledImageModels,
    setPersonaChipWidth,

    // Integrated handlers
    handleHistoryNavigation,
    handleHistoryNavigationDown,
    handleInputChange,
    resetInputState,

    // Computed props
    navigationProps,
  };
}
