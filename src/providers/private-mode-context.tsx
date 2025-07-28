import type { Id } from "@convex/_generated/dataModel";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Attachment, ReasoningConfig } from "@/types";

interface ChatInputState {
  input: string;
  attachments: Attachment[];
  selectedPersonaId: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
  temperature?: number;
}

interface PrivateModeContextType {
  isPrivateMode: boolean;
  togglePrivateMode: () => void;
  setPrivateMode: (value: boolean) => void;

  // Chat input state preservation
  chatInputState: ChatInputState;
  setChatInputState: (state: Partial<ChatInputState>) => void;
  clearChatInputState: () => void;
}

const defaultChatInputState: ChatInputState = {
  input: "",
  attachments: [],
  selectedPersonaId: null,
  reasoningConfig: {
    enabled: false,
    effort: "medium",
  },
  temperature: undefined,
};

const PrivateModeContext = createContext<PrivateModeContextType | undefined>(
  undefined
);

export function PrivateModeProvider({ children }: { children: ReactNode }) {
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [chatInputState, setChatInputStateInternal] = useState<ChatInputState>(
    defaultChatInputState
  );

  const togglePrivateMode = useCallback(() => {
    setIsPrivateMode(prev => !prev);
  }, []);

  const setPrivateMode = useCallback((value: boolean) => {
    setIsPrivateMode(value);
  }, []);

  const setChatInputState = useCallback((state: Partial<ChatInputState>) => {
    setChatInputStateInternal(prev => ({ ...prev, ...state }));
  }, []);

  const clearChatInputState = useCallback(() => {
    setChatInputStateInternal(defaultChatInputState);
  }, []);

  const value = useMemo(
    () => ({
      isPrivateMode,
      togglePrivateMode,
      setPrivateMode,
      chatInputState,
      setChatInputState,
      clearChatInputState,
    }),
    [
      isPrivateMode,
      togglePrivateMode,
      setPrivateMode,
      chatInputState,
      setChatInputState,
      clearChatInputState,
    ]
  );

  return (
    <PrivateModeContext.Provider value={value}>
      {children}
    </PrivateModeContext.Provider>
  );
}

export function usePrivateMode() {
  const context = useContext(PrivateModeContext);
  if (context === undefined) {
    throw new Error("usePrivateMode must be used within a PrivateModeProvider");
  }
  return context;
}
