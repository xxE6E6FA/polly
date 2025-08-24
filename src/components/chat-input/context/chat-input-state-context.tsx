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

  // Mention state
  mentionOpen: boolean;
  mentionQuery: string;
  mentionActiveIndex: number;

  setInput: (value: string) => void;
  setSelectedPersonaId: (value: Id<"personas"> | null) => void;
  setReasoningConfig: (value: ReasoningConfig) => void;
  setTemperature: (value: number | undefined) => void;
  setPersonaChipWidth: (width: number) => void;

  handleInputChange: (value: string, userMessages: string[]) => void;
  resetInputState: () => void;

  // Mention handlers
  handleMentionStateChange: (state: {
    open: boolean;
    query: string;
    activeIndex: number;
  }) => void;
  handleMentionNavigate: (
    direction: "up" | "down",
    mentionItems: Array<{
      id: Id<"personas"> | null;
      name: string;
      icon?: string;
    }>
  ) => boolean;
  handleMentionConfirm: (
    mentionItems: Array<{
      id: Id<"personas"> | null;
      name: string;
      icon?: string;
    }>
  ) => Id<"personas"> | null;
  handleMentionCancel: () => boolean;
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

      // Mention state
      mentionOpen: coreState.mentionOpen,
      mentionQuery: coreState.mentionQuery,
      mentionActiveIndex: coreState.mentionActiveIndex,

      setInput: coreState.setInput,
      setSelectedPersonaId: coreState.setSelectedPersonaId,
      setReasoningConfig: coreState.setReasoningConfig,
      setTemperature: coreState.setTemperature,
      setPersonaChipWidth: coreState.setPersonaChipWidth,

      handleInputChange: coreState.handleInputChange,
      resetInputState: coreState.resetInputState,

      // Mention handlers
      handleMentionStateChange: coreState.handleMentionStateChange,
      handleMentionNavigate: coreState.handleMentionNavigate,
      handleMentionConfirm: coreState.handleMentionConfirm,
      handleMentionCancel: coreState.handleMentionCancel,
    }),
    [
      coreState.input,
      coreState.selectedPersonaId,
      coreState.reasoningConfig,
      coreState.temperature,
      coreState.personaChipWidth,
      coreState.mentionOpen,
      coreState.mentionQuery,
      coreState.mentionActiveIndex,
      coreState.setInput,
      coreState.setSelectedPersonaId,
      coreState.setReasoningConfig,
      coreState.setTemperature,
      coreState.setPersonaChipWidth,
      coreState.handleInputChange,
      coreState.resetInputState,
      coreState.handleMentionStateChange,
      coreState.handleMentionNavigate,
      coreState.handleMentionConfirm,
      coreState.handleMentionCancel,
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
