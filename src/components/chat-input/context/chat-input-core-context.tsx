import type { Id } from "@convex/_generated/dataModel";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type {
  Attachment,
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";
import { useChatInputState } from "../hooks/use-chat-input-state";

interface ChatInputCoreContextValue {
  // Full state from useChatInputState - single source of truth
  input: string;
  attachments: Attachment[];
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
  generationMode: GenerationMode;
  imageParams: ImageGenerationParams;
  negativePromptEnabled: boolean;
  isFullscreen: boolean;
  isMultiline: boolean;
  isTransitioning: boolean;
  historyIndex: number;
  originalInput: string;
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
  shouldUsePreservedState: boolean | undefined;

  // Setters
  setInput: (value: string) => void;
  setAttachments: (
    newValue: Attachment[] | ((prev: Attachment[]) => Attachment[])
  ) => void;
  setSelectedPersonaId: (value: Id<"personas"> | null) => void;
  setReasoningConfig: (value: ReasoningConfig) => void;
  setTemperature: (value: number | undefined) => void;
  setGenerationMode: (mode: GenerationMode) => void;
  setImageParams: (
    value:
      | ImageGenerationParams
      | ((prev: ImageGenerationParams) => ImageGenerationParams)
  ) => void;
  setNegativePromptEnabled: (enabled: boolean) => void;
  setPersonaChipWidth: (width: number) => void;

  // Handlers
  handleHeightChange: (isMultiline: boolean) => void;
  handleToggleFullscreen: () => void;
  handleCloseFullscreen: () => void;
  handleHistoryNavigation: (userMessages: string[]) => boolean;
  handleHistoryNavigationDown: (userMessages: string[]) => boolean;
  handleInputChange: (value: string, userMessages: string[]) => void;
  handleNegativePromptEnabledChange: (enabled: boolean) => void;
  handleNegativePromptValueChange: (value: string) => void;
  resetInputState: () => void;

  // Computed props
  navigationProps: {
    onHistoryNavigation: (userMessages: string[]) => boolean;
    onHistoryNavigationDown: (userMessages: string[]) => boolean;
    onHeightChange: (isMultiline: boolean) => void;
    isTransitioning: boolean;
  };
}

const ChatInputCoreContext = createContext<ChatInputCoreContextValue | null>(
  null
);

interface ChatInputCoreProviderProps {
  children: ReactNode;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
}

export function ChatInputCoreProvider({
  children,
  conversationId,
  hasExistingMessages,
  currentReasoningConfig,
  currentTemperature,
}: ChatInputCoreProviderProps) {
  // SINGLE call to useChatInputState - this is the performance fix!
  const state = useChatInputState({
    conversationId,
    hasExistingMessages,
    currentReasoningConfig,
    currentTemperature,
  });

  const contextValue = useMemo(
    (): ChatInputCoreContextValue => ({
      // Expose entire state object - all consumers get access to everything
      ...state,
    }),
    [state]
  );

  return (
    <ChatInputCoreContext.Provider value={contextValue}>
      {children}
    </ChatInputCoreContext.Provider>
  );
}

export function useChatInputCoreContext() {
  const context = useContext(ChatInputCoreContext);
  if (!context) {
    throw new Error(
      "useChatInputCoreContext must be used within ChatInputCoreProvider"
    );
  }
  return context;
}
