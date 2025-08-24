import { createContext, type ReactNode, useContext, useMemo } from "react";
import type {
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
} from "@/types";
import { useChatInputCoreContext } from "./chat-input-core-context";

interface ChatInputUIContextValue {
  generationMode: GenerationMode;
  imageParams: ImageGenerationParams;
  negativePromptEnabled: boolean;
  isFullscreen: boolean;
  isMultiline: boolean;
  enabledImageModels:
    | Array<{
        modelId: string;
        name: string;
        description?: string;
        supportsMultipleImages?: boolean;
        supportsNegativePrompt?: boolean;
      }>
    | undefined;

  setGenerationMode: (mode: GenerationMode) => void;
  setImageParams: (
    value:
      | ImageGenerationParams
      | ((prev: ImageGenerationParams) => ImageGenerationParams)
  ) => void;

  handleToggleFullscreen: () => void;
  handleCloseFullscreen: () => void;
  handleNegativePromptEnabledChange: (enabled: boolean) => void;
}

const ChatInputUIContext = createContext<ChatInputUIContextValue | null>(null);

interface ChatInputUIProviderProps {
  children: ReactNode;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
}

export function ChatInputUIProvider({
  children,
}: Omit<ChatInputUIProviderProps, "conversationId" | "hasExistingMessages">) {
  // Get state from the core context instead of calling the hook directly
  const coreState = useChatInputCoreContext();

  const contextValue = useMemo(
    (): ChatInputUIContextValue => ({
      generationMode: coreState.generationMode,
      imageParams: coreState.imageParams,
      negativePromptEnabled: coreState.negativePromptEnabled,
      isFullscreen: coreState.isFullscreen,
      isMultiline: coreState.isMultiline,
      enabledImageModels: coreState.enabledImageModels,

      setGenerationMode: coreState.setGenerationMode,
      setImageParams: coreState.setImageParams,

      handleToggleFullscreen: coreState.handleToggleFullscreen,
      handleCloseFullscreen: coreState.handleCloseFullscreen,
      handleNegativePromptEnabledChange:
        coreState.handleNegativePromptEnabledChange,
    }),
    [
      coreState.generationMode,
      coreState.imageParams,
      coreState.negativePromptEnabled,
      coreState.isFullscreen,
      coreState.isMultiline,
      coreState.enabledImageModels,
      coreState.setGenerationMode,
      coreState.setImageParams,
      coreState.handleToggleFullscreen,
      coreState.handleCloseFullscreen,
      coreState.handleNegativePromptEnabledChange,
    ]
  );

  return (
    <ChatInputUIContext.Provider value={contextValue}>
      {children}
    </ChatInputUIContext.Provider>
  );
}

export function useChatInputUIContext() {
  const context = useContext(ChatInputUIContext);
  if (!context) {
    throw new Error(
      "useChatInputUIContext must be used within ChatInputUIProvider"
    );
  }
  return context;
}
