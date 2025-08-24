import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { ConversationId } from "@/types";
import { useChatInputCoreContext } from "./chat-input-core-context";

interface ChatInputNavigationContextValue {
  navigationProps: {
    onHistoryNavigation: (userMessages: string[]) => boolean;
    onHistoryNavigationDown: (userMessages: string[]) => boolean;
    onHeightChange: (isMultiline: boolean) => void;
    isTransitioning: boolean;
  };
}

const ChatInputNavigationContext =
  createContext<ChatInputNavigationContextValue | null>(null);

interface ChatInputNavigationProviderProps {
  children: ReactNode;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
}

export function ChatInputNavigationProvider({
  children,
}: Omit<
  ChatInputNavigationProviderProps,
  "conversationId" | "hasExistingMessages"
>) {
  // Get state from the core context instead of calling the hook directly
  const coreState = useChatInputCoreContext();

  const contextValue = useMemo(
    (): ChatInputNavigationContextValue => ({
      navigationProps: coreState.navigationProps,
    }),
    [coreState.navigationProps]
  );

  return (
    <ChatInputNavigationContext.Provider value={contextValue}>
      {children}
    </ChatInputNavigationContext.Provider>
  );
}

export function useChatInputNavigationContext() {
  const context = useContext(ChatInputNavigationContext);
  if (!context) {
    throw new Error(
      "useChatInputNavigationContext must be used within ChatInputNavigationProvider"
    );
  }
  return context;
}
