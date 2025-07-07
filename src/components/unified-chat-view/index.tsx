import type { Id } from "@convex/_generated/dataModel";
import { memo, useCallback } from "react";
import { ChatHeader } from "@/components/chat-header";

import { ChatOutline } from "@/components/chat-outline";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { QuoteButton } from "@/components/ui/quote-button";
import { cn } from "@/lib/utils";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ArchivedBanner } from "./ArchivedBanner";
import { ChatControls } from "./ChatControls";
import { useChatViewState } from "./hooks/useChatViewState";
import { MessageArea } from "./MessageArea";

type UnifiedChatViewProps = {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isStreaming: boolean;
  currentPersonaId: Id<"personas"> | null;
  currentReasoningConfig?: ReasoningConfig;
  canSavePrivateChat: boolean;
  hasApiKeys: boolean;
  isArchived?: boolean;
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
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onStopGeneration: () => void;
  onSavePrivateChat?: () => Promise<void>;
  onRetryUserMessage?: (
    messageId: string,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onRetryAssistantMessage?: (
    messageId: string,
    reasoningConfig?: ReasoningConfig
  ) => void;
};

export const UnifiedChatView = memo(
  ({
    conversationId,
    messages,
    isLoading,
    isLoadingMessages,
    isStreaming,
    currentPersonaId,
    canSavePrivateChat,
    hasApiKeys,
    isArchived,
    onSendMessage,
    onSendAsNewConversation,
    onDeleteMessage,
    onEditMessage,
    onStopGeneration,
    onSavePrivateChat,
    onRetryUserMessage,
    onRetryAssistantMessage,
  }: UnifiedChatViewProps) => {
    const {
      // Refs
      virtualizedMessagesRef,
      messagesContainerRef,
      chatInputRef,

      // UI state
      selection,
      confirmationDialog,
      isEmpty,
      isLoadingConversation,

      // Handlers
      handleOutlineNavigate,
      handleSendMessage,
      handleDeleteMessage,
      handleQuoteSelection,
      handleUnarchive,
      lockSelection,
      unlockSelection,
      getCurrentReasoningConfig,
    } = useChatViewState({
      conversationId,
      messages,
      isLoadingMessages,
      onSendMessage,
      onDeleteMessage,
    });

    // Create wrapper handlers that get the current reasoning config
    const handleRetryUserMessage = useCallback(
      (messageId: string) => {
        const currentReasoningConfig = getCurrentReasoningConfig();
        onRetryUserMessage?.(messageId, currentReasoningConfig);
      },
      [onRetryUserMessage, getCurrentReasoningConfig]
    );

    const handleRetryAssistantMessage = useCallback(
      (messageId: string) => {
        const currentReasoningConfig = getCurrentReasoningConfig();
        onRetryAssistantMessage?.(messageId, currentReasoningConfig);
      },
      [onRetryAssistantMessage, getCurrentReasoningConfig]
    );

    return (
      <div className="flex h-full">
        <div className="relative flex h-full flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <div className="relative flex h-full flex-col overflow-hidden">
              <div className="relative z-10 flex h-full flex-col overflow-hidden">
                {/* Static Header */}
                {(isLoadingConversation || !isEmpty) && (
                  <div className="sticky top-0 z-20 h-12 flex-shrink-0">
                    <div className="flex h-12 items-center px-4 lg:px-6">
                      <ChatHeader
                        conversationId={conversationId}
                        isPrivateMode={!conversationId}
                        isArchived={isArchived}
                        onSavePrivateChat={onSavePrivateChat}
                        canSavePrivateChat={canSavePrivateChat}
                        privateMessages={messages}
                        privatePersonaId={currentPersonaId || undefined}
                      />
                    </div>
                  </div>
                )}

                {/* Messages area */}
                <div
                  ref={messagesContainerRef}
                  className={cn(
                    "flex-1 overflow-hidden",
                    isEmpty && "overflow-y-auto"
                  )}
                >
                  <MessageArea
                    ref={virtualizedMessagesRef}
                    conversationId={conversationId}
                    messages={messages}
                    isEmpty={isEmpty}
                    isLoadingConversation={isLoadingConversation}
                    isStreaming={isStreaming}
                    isArchived={isArchived}
                    onDeleteMessage={handleDeleteMessage}
                    onEditMessage={onEditMessage}
                    onRetryUserMessage={handleRetryUserMessage}
                    onRetryAssistantMessage={handleRetryAssistantMessage}
                  />
                </div>

                {/* Archived conversation banner */}
                <ArchivedBanner
                  isArchived={isArchived}
                  hasApiKeys={hasApiKeys}
                  onUnarchive={handleUnarchive}
                />

                {/* Chat input and controls */}
                <ChatControls
                  ref={chatInputRef}
                  conversationId={conversationId}
                  messages={messages}
                  isLoading={isLoading}
                  isStreaming={isStreaming}
                  hasApiKeys={hasApiKeys}
                  isArchived={isArchived}
                  onSendMessage={handleSendMessage}
                  onSendAsNewConversation={onSendAsNewConversation}
                  onStopGeneration={onStopGeneration}
                  currentReasoningConfig={getCurrentReasoningConfig()}
                />

                {/* Quote button overlay */}
                {selection?.text && (
                  <QuoteButton
                    selectedText={selection.text}
                    onQuote={handleQuoteSelection}
                    rect={selection.rect}
                    onLockSelection={lockSelection}
                    onUnlockSelection={unlockSelection}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Chat outline */}
        {messages.length > 1 && (
          <ChatOutline messages={messages} onNavigate={handleOutlineNavigate} />
        )}

        {/* Confirmation dialog */}
        <ConfirmationDialog
          open={confirmationDialog.isOpen}
          title={confirmationDialog.options.title}
          description={confirmationDialog.options.description}
          confirmText={confirmationDialog.options.confirmText}
          variant={confirmationDialog.options.variant}
          onConfirm={confirmationDialog.handleConfirm}
          onCancel={confirmationDialog.handleCancel}
          onOpenChange={confirmationDialog.handleOpenChange}
        />
      </div>
    );
  }
);

UnifiedChatView.displayName = "UnifiedChatView";
