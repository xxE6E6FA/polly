import { forwardRef, useCallback } from "react";
import { ChatZeroState } from "@/components/chat-zero-state";
import { Spinner } from "@/components/spinner";
import {
  VirtualizedChatMessages,
  type VirtualizedChatMessagesRef,
} from "@/components/virtualized-chat-messages";
import { usePrivateMode } from "@/contexts/private-mode-context";
import type { ChatMessage, ConversationId } from "@/types";

interface MessageAreaProps {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isEmpty: boolean;
  isLoadingConversation: boolean | undefined;
  isStreaming: boolean;
  isArchived?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onRetryUserMessage?: (messageId: string) => void;
  onRetryAssistantMessage?: (messageId: string) => void;
}

const ConversationZeroState = () => {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center space-y-1 max-w-md px-4">
        <p className="text-base font-medium text-foreground">
          Start a conversation
        </p>
        <p className="text-xs text-muted-foreground">
          Send a message to begin chatting
        </p>
      </div>
    </div>
  );
};

export const MessageArea = forwardRef<
  VirtualizedChatMessagesRef,
  MessageAreaProps
>(
  (
    {
      conversationId,
      messages,
      isEmpty,
      isLoadingConversation,
      isStreaming,
      isArchived,
      onDeleteMessage,
      onEditMessage,
      onRetryUserMessage,
      onRetryAssistantMessage,
    },
    ref
  ) => {
    const { isPrivateMode } = usePrivateMode();

    // Create wrapper handlers that pass the reasoning config
    const handleRetryUserMessage = useCallback(
      (messageId: string) => {
        onRetryUserMessage?.(messageId);
      },
      [onRetryUserMessage]
    );

    const handleRetryAssistantMessage = useCallback(
      (messageId: string) => {
        onRetryAssistantMessage?.(messageId);
      },
      [onRetryAssistantMessage]
    );

    const renderContent = useCallback(() => {
      if (isLoadingConversation) {
        // TODO: Get this from the hook - hasLoadedConversation.current
        const hasLoadedConversation = false; // This should come from parent

        if (hasLoadedConversation) {
          return <div className="h-full" />;
        }
        return (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        );
      }

      if (isEmpty) {
        if (!(isPrivateMode || conversationId)) {
          return <ChatZeroState />;
        }
        if (isPrivateMode) {
          return <ConversationZeroState />;
        }
        // For regular conversations that are empty (after loading), show blank
        return <div className="h-full" />;
      }

      return (
        <VirtualizedChatMessages
          ref={ref}
          messages={messages}
          isStreaming={isStreaming}
          onDeleteMessage={
            isPrivateMode || isArchived ? undefined : onDeleteMessage
          }
          onEditMessage={
            isPrivateMode || isArchived ? undefined : onEditMessage
          }
          onRetryUserMessage={isArchived ? undefined : handleRetryUserMessage}
          onRetryAssistantMessage={
            isArchived ? undefined : handleRetryAssistantMessage
          }
          scrollElement={null}
          shouldScrollToBottom={isStreaming}
        />
      );
    }, [
      isLoadingConversation,
      isEmpty,
      isPrivateMode,
      conversationId,
      messages,
      isStreaming,
      isArchived,
      onDeleteMessage,
      onEditMessage,
      handleRetryUserMessage,
      handleRetryAssistantMessage,
      ref,
    ]);

    return renderContent();
  }
);

MessageArea.displayName = "MessageArea";
