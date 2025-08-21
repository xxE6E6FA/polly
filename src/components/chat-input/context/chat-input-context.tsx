import type { Id } from "@convex/_generated/dataModel";
import { createContext, type ReactNode, useContext } from "react";
import type {
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";
import { useChatInputState } from "../hooks/use-chat-input-state";

interface ChatInputContextValue {
  input: string;
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
  generationMode: GenerationMode;
  imageParams: ImageGenerationParams;
  negativePromptEnabled: boolean;
  isFullscreen: boolean;
  isMultiline: boolean;
  personaChipWidth: number;
  enabledImageModels:
    | Array<{
        modelId: string;
        name: string;
        description?: string;
        supportsMultipleImages?: boolean;
        supportsNegativePrompt?: boolean;
      }>
    | undefined;

  setInput: (value: string) => void;
  setSelectedPersonaId: (value: Id<"personas"> | null) => void;
  setReasoningConfig: (value: ReasoningConfig) => void;
  setTemperature: (value: number | undefined) => void;
  setGenerationMode: (mode: GenerationMode) => void;
  setImageParams: (
    value:
      | ImageGenerationParams
      | ((prev: ImageGenerationParams) => ImageGenerationParams)
  ) => void;
  setPersonaChipWidth: (width: number) => void;

  handleToggleFullscreen: () => void;
  handleCloseFullscreen: () => void;
  handleInputChange: (value: string, userMessages: string[]) => void;
  handleNegativePromptEnabledChange: (enabled: boolean) => void;
  resetInputState: () => void;

  navigationProps: {
    onHistoryNavigation: (userMessages: string[]) => boolean;
    onHistoryNavigationDown: (userMessages: string[]) => boolean;
    onHeightChange: (isMultiline: boolean) => void;
    isTransitioning: boolean;
  };
}

const ChatInputContext = createContext<ChatInputContextValue | null>(null);

interface ChatInputProviderProps {
  children: ReactNode;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
}

export function ChatInputProvider({
  children,
  conversationId,
  hasExistingMessages,
  currentReasoningConfig,
  currentTemperature,
}: ChatInputProviderProps) {
  const state = useChatInputState({
    conversationId,
    hasExistingMessages,
    currentReasoningConfig,
    currentTemperature,
  });

  const contextValue: ChatInputContextValue = {
    input: state.input,
    selectedPersonaId: state.selectedPersonaId,
    reasoningConfig: state.reasoningConfig,
    temperature: state.temperature,
    generationMode: state.generationMode,
    imageParams: state.imageParams,
    negativePromptEnabled: state.negativePromptEnabled,
    isFullscreen: state.isFullscreen,
    isMultiline: state.isMultiline,
    personaChipWidth: state.personaChipWidth,
    enabledImageModels: state.enabledImageModels,

    setInput: state.setInput,
    setSelectedPersonaId: state.setSelectedPersonaId,
    setReasoningConfig: state.setReasoningConfig,
    setTemperature: state.setTemperature,
    setGenerationMode: state.setGenerationMode,
    setImageParams: state.setImageParams,
    setPersonaChipWidth: state.setPersonaChipWidth,

    handleToggleFullscreen: state.handleToggleFullscreen,
    handleCloseFullscreen: state.handleCloseFullscreen,
    handleInputChange: state.handleInputChange,
    handleNegativePromptEnabledChange: state.handleNegativePromptEnabledChange,
    resetInputState: state.resetInputState,

    navigationProps: state.navigationProps,
  };

  return (
    <ChatInputContext.Provider value={contextValue}>
      {children}
    </ChatInputContext.Provider>
  );
}

export function useChatInputContext() {
  const context = useContext(ChatInputContext);
  if (!context) {
    throw new Error(
      "useChatInputContext must be used within ChatInputProvider"
    );
  }
  return context;
}
