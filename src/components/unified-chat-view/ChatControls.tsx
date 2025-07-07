import type { Id } from "@convex/_generated/dataModel";
import { forwardRef } from "react";
import { ChatInput, type ChatInputRef } from "@/components/chat-input/index";
import { usePrivateMode } from "@/contexts/private-mode-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

interface ChatControlsProps {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  hasApiKeys: boolean;
  isArchived?: boolean;
  currentReasoningConfig?: ReasoningConfig;
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  onSendAsNewConversation?: (
    content: string,
    navigate: boolean,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  onStopGeneration: () => void;
}

export const ChatControls = forwardRef<ChatInputRef, ChatControlsProps>(
  (
    {
      conversationId,
      messages,
      isLoading,
      isStreaming,
      hasApiKeys,
      isArchived,
      currentReasoningConfig,
      onSendMessage,
      onSendAsNewConversation,
      onStopGeneration,
    },
    ref
  ) => {
    const { isPrivateMode } = usePrivateMode();

    if (!hasApiKeys || isArchived) {
      return null;
    }

    return (
      <div className="relative flex-shrink-0">
        <ChatInput
          ref={ref}
          conversationId={conversationId}
          hasExistingMessages={messages.length > 0}
          isLoading={isLoading}
          isStreaming={isStreaming}
          placeholder={
            isPrivateMode
              ? "Private mode: messages won't be saved..."
              : "Ask me anything..."
          }
          onSendMessage={onSendMessage}
          onStop={onStopGeneration}
          onSendAsNewConversation={onSendAsNewConversation}
          currentReasoningConfig={currentReasoningConfig}
        />
      </div>
    );
  }
);

ChatControls.displayName = "ChatControls";
