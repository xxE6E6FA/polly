import type { ReactNode } from "react";
import type { ConversationId, ReasoningConfig } from "@/types";
import { ChatInputCoreProvider } from "./chat-input-core-context";
import { ChatInputNavigationProvider } from "./chat-input-navigation-context";
import { ChatInputStateProvider } from "./chat-input-state-context";
import { ChatInputUIProvider } from "./chat-input-ui-context";

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
  return (
    <ChatInputCoreProvider
      conversationId={conversationId}
      hasExistingMessages={hasExistingMessages}
      currentReasoningConfig={currentReasoningConfig}
      currentTemperature={currentTemperature}
    >
      <ChatInputStateProvider>
        <ChatInputUIProvider>
          <ChatInputNavigationProvider>{children}</ChatInputNavigationProvider>
        </ChatInputUIProvider>
      </ChatInputStateProvider>
    </ChatInputCoreProvider>
  );
}

export { useChatInputNavigationContext } from "./chat-input-navigation-context";
// Re-export individual context hooks for backward compatibility
export { useChatInputStateContext as useChatInputContext } from "./chat-input-state-context";
export { useChatInputUIContext } from "./chat-input-ui-context";
