import type { Id } from "@convex/_generated/dataModel";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { ConversationId, ReasoningConfig } from "@/types";
import { useChatInputCoreContext } from "./chat-input-core-context";

interface ChatInputStateContextValue {
  input: string;
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
  personaChipWidth: number;

  setInput: (value: string) => void;
  setSelectedPersonaId: (value: Id<"personas"> | null) => void;
  setReasoningConfig: (value: ReasoningConfig) => void;
  setTemperature: (value: number | undefined) => void;
  setPersonaChipWidth: (width: number) => void;

  handleInputChange: (value: string, userMessages: string[]) => void;
  resetInputState: () => void;
}

const ChatInputStateContext = createContext<ChatInputStateContextValue | null>(
  null
);

interface ChatInputStateProviderProps {
  children: ReactNode;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
}

export function ChatInputStateProvider({
  children,
}: Omit<
  ChatInputStateProviderProps,
  | "conversationId"
  | "hasExistingMessages"
  | "currentReasoningConfig"
  | "currentTemperature"
>) {
  // Get state from the core context instead of calling the hook directly
  const coreState = useChatInputCoreContext();

  const contextValue = useMemo(
    (): ChatInputStateContextValue => ({
      input: coreState.input,
      selectedPersonaId: coreState.selectedPersonaId,
      reasoningConfig: coreState.reasoningConfig,
      temperature: coreState.temperature,
      personaChipWidth: coreState.personaChipWidth,

      setInput: coreState.setInput,
      setSelectedPersonaId: coreState.setSelectedPersonaId,
      setReasoningConfig: coreState.setReasoningConfig,
      setTemperature: coreState.setTemperature,
      setPersonaChipWidth: coreState.setPersonaChipWidth,

      handleInputChange: coreState.handleInputChange,
      resetInputState: coreState.resetInputState,
    }),
    [
      coreState.input,
      coreState.selectedPersonaId,
      coreState.reasoningConfig,
      coreState.temperature,
      coreState.personaChipWidth,
      coreState.setInput,
      coreState.setSelectedPersonaId,
      coreState.setReasoningConfig,
      coreState.setTemperature,
      coreState.setPersonaChipWidth,
      coreState.handleInputChange,
      coreState.resetInputState,
    ]
  );

  return (
    <ChatInputStateContext.Provider value={contextValue}>
      {children}
    </ChatInputStateContext.Provider>
  );
}

export function useChatInputStateContext() {
  const context = useContext(ChatInputStateContext);
  if (!context) {
    throw new Error(
      "useChatInputStateContext must be used within ChatInputStateProvider"
    );
  }
  return context;
}
