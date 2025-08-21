import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatInputPreservation } from "@/hooks/use-chat-input-preservation";
import { getDefaultReasoningConfig } from "@/lib/message-reasoning-utils";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";

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
  const { setChatInputState, getChatInputState, clearChatInputState } =
    useChatInputPreservation();

  // Query enabled image models to check capabilities
  const enabledImageModels = useQuery(
    api.imageModels.getUserImageModels,
    user?._id ? {} : "skip"
  );

  // Always preserve state per conversation, use global state for new conversations
  // Only use preserved state if we have a conversationId (existing conversation)
  // For new conversations (no conversationId), always start fresh
  const shouldUsePreservedState = conversationId && !hasExistingMessages;

  // Core input state
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

  // Image generation state
  const [generationMode, setGenerationMode] = useState<GenerationMode>("text");

  const [imageParams, setImageParams] = useState<ImageGenerationParams>({
    prompt: "",
    model: IMAGE_GENERATION_DEFAULTS.MODEL,
    aspectRatio: IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO,
    steps: IMAGE_GENERATION_DEFAULTS.STEPS,
    guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
    count: IMAGE_GENERATION_DEFAULTS.COUNT,
    negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
  });

  // Negative prompt toggle state (separate from imageParams for better UX)
  const [negativePromptEnabled, setNegativePromptEnabled] = useState(false);

  // Fullscreen input state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // History navigation state
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");

  // Persona chip width for layout
  const [personaChipWidth, setPersonaChipWidth] = useState<number>(0);

  // Reset multiline state when starting a new conversation
  useEffect(() => {
    if (!conversationId && input.trim().length === 0) {
      setIsMultiline(false);
    }
  }, [conversationId, input]);

  // Force reset multiline state when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setIsMultiline(false);
      // Clear global preserved state when starting a new conversation
      clearChatInputState();
    }
  }, [conversationId, clearChatInputState]);

  // Sync reasoning config with current config when available
  useEffect(() => {
    if (conversationId && !shouldUsePreservedState) {
      setReasoningConfigState(getDefaultReasoningConfig());
    } else if (currentReasoningConfig && shouldUsePreservedState) {
      setReasoningConfigState(currentReasoningConfig);
    }
  }, [conversationId, shouldUsePreservedState, currentReasoningConfig]);

  // Sync negative prompt toggle state with imageParams.negativePrompt
  useEffect(() => {
    const hasNegativePrompt =
      imageParams.negativePrompt &&
      imageParams.negativePrompt.trim().length > 0;
    setNegativePromptEnabled(!!hasNegativePrompt);
  }, [imageParams.negativePrompt]);

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

  // Fullscreen input handlers
  const handleHeightChange = useCallback((multiline: boolean) => {
    setIsMultiline(multiline);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsTransitioning(true);
    setIsFullscreen(!isFullscreen);

    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, [isFullscreen]);

  const handleCloseFullscreen = useCallback(() => {
    setIsTransitioning(true);
    setIsFullscreen(false);

    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, []);

  // History navigation handlers
  const handleHistoryNavigation = useCallback(
    (userMessages: string[]) => {
      if (userMessages.length === 0) {
        return false;
      }

      if (historyIndex === -1) {
        setOriginalInput(input);
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex < userMessages.length) {
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);
        return true;
      }

      return false;
    },
    [historyIndex, input, setInput]
  );

  const handleHistoryNavigationDown = useCallback(
    (userMessages: string[]) => {
      if (historyIndex <= -1) {
        return false;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex === -1) {
        // Return to original input
        setHistoryIndex(-1);
        setInput(originalInput);
        return true;
      }

      if (nextIndex >= 0) {
        // Navigate to newer message in history
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);
        return true;
      }

      return false;
    },
    [historyIndex, originalInput, setInput]
  );

  // Reset history when input changes (user typing)
  const handleInputChange = useCallback(
    (value: string, userMessages: string[]) => {
      if (historyIndex !== -1 && value !== userMessages[historyIndex]) {
        setHistoryIndex(-1);
        setOriginalInput("");
      }
      setInput(value);
    },
    [historyIndex, setInput]
  );

  // Image generation handlers
  const handleNegativePromptEnabledChange = useCallback((enabled: boolean) => {
    setNegativePromptEnabled(enabled);
    if (!enabled) {
      setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    }
  }, []);

  const handleNegativePromptValueChange = useCallback((value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  }, []);

  // State reset handlers
  const resetInputState = useCallback(() => {
    setInput("");
    setAttachments([]);
    setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    setNegativePromptEnabled(false);
    if (shouldUsePreservedState) {
      clearChatInputState();
    }
  }, [shouldUsePreservedState, clearChatInputState, setInput, setAttachments]);

  // Memoized navigation props to prevent recreation
  const navigationProps = useMemo(
    () => ({
      onHistoryNavigation: handleHistoryNavigation,
      onHistoryNavigationDown: handleHistoryNavigationDown,
      onHeightChange: handleHeightChange,
      isTransitioning,
    }),
    [
      handleHistoryNavigation,
      handleHistoryNavigationDown,
      handleHeightChange,
      isTransitioning,
    ]
  );

  return {
    // State
    input,
    attachments,
    selectedPersonaId,
    reasoningConfig,
    temperature,
    generationMode,
    imageParams,
    negativePromptEnabled,
    isFullscreen,
    isMultiline,
    isTransitioning,
    historyIndex,
    originalInput,
    personaChipWidth,
    enabledImageModels,
    shouldUsePreservedState,

    // Setters
    setInput,
    setAttachments,
    setSelectedPersonaId,
    setReasoningConfig,
    setTemperature,
    setGenerationMode,
    setImageParams,
    setNegativePromptEnabled,
    setPersonaChipWidth,

    // Handlers
    handleHeightChange,
    handleToggleFullscreen,
    handleCloseFullscreen,
    handleHistoryNavigation,
    handleHistoryNavigationDown,
    handleInputChange,
    handleNegativePromptEnabledChange,
    handleNegativePromptValueChange,
    resetInputState,

    // Computed props
    navigationProps,
  };
}
