import type { Id } from "@convex/_generated/dataModel";
import { memo, useCallback } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatOutline } from "@/components/chat-outline";
import { ChatZeroState } from "@/components/chat-zero-state";
import { Spinner } from "@/components/spinner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { QuoteButton } from "@/components/ui/quote-button";
import { VirtualizedChatMessages } from "@/components/virtualized-chat-messages";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ChatInput } from "../chat-input";
import { ArchivedBanner } from "./ArchivedBanner";
import { useChatViewState } from "./hooks/useChatViewState";

type UnifiedChatViewProps = {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isStreaming: boolean;
  currentPersonaId: Id<"personas"> | null;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
  canSavePrivateChat: boolean;
  hasApiKeys: boolean;
  isArchived?: boolean;
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<void>;
  onSendAsNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<ConversationId | undefined>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onStopGeneration: () => void;
  onSavePrivateChat?: () => Promise<void>;
  onTemperatureChange?: (temperature: number | undefined) => void;
  onRetryUserMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => void;
  onRetryAssistantMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
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
    currentTemperature,
    canSavePrivateChat,
    hasApiKeys,
    isArchived,
    onSendMessage,
    onSendAsNewConversation,
    onDeleteMessage,
    onEditMessage,
    onStopGeneration,
    onSavePrivateChat,
    onTemperatureChange,
    onRetryUserMessage,
    onRetryAssistantMessage,
  }: UnifiedChatViewProps) => {
    const { isPrivateMode } = usePrivateMode();
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
      onDeleteMessage,
      onSendMessage,
    });

    // Create wrapper handlers for retry functions
    const handleRetryUserMessage = useCallback(
      (
        messageId: string,
        modelId?: string,
        provider?: string,
        reasoningConfig?: ReasoningConfig
      ) => {
        onRetryUserMessage?.(
          messageId,
          modelId,
          provider,
          reasoningConfig,
          currentTemperature
        );
      },
      [onRetryUserMessage, currentTemperature]
    );

    const handleRetryAssistantMessage = useCallback(
      (
        messageId: string,
        modelId?: string,
        provider?: string,
        reasoningConfig?: ReasoningConfig
      ) => {
        onRetryAssistantMessage?.(
          messageId,
          modelId,
          provider,
          reasoningConfig,
          currentTemperature
        );
      },
      [onRetryAssistantMessage, currentTemperature]
    );

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

    // CSS mask gradient for seamless scrolling
    const maskGradient =
      "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 16px, rgba(0,0,0,0.9) 32px, rgba(0,0,0,0.9) calc(100% - 32px), rgba(0,0,0,0.1) calc(100% - 16px), transparent 100%)";

    const renderMessageArea = () => {
      if (isLoadingConversation) {
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
          ref={virtualizedMessagesRef}
          messages={messages}
          isStreaming={isStreaming}
          onDeleteMessage={
            isPrivateMode || isArchived ? undefined : handleDeleteMessage
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
    };

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

                <div
                  ref={messagesContainerRef}
                  className={cn(
                    "flex-1 overflow-hidden",
                    isEmpty && "overflow-y-auto"
                  )}
                  style={{
                    maskImage: maskGradient,
                    // biome-ignore lint/style/useNamingConvention: CSS property requires PascalCase
                    WebkitMaskImage: maskGradient,
                  }}
                >
                  {renderMessageArea()}
                </div>

                {/* Archived conversation banner */}
                <ArchivedBanner
                  isArchived={isArchived}
                  hasApiKeys={hasApiKeys}
                  onUnarchive={handleUnarchive}
                />

                {/* Chat input and controls */}
                {hasApiKeys && !isArchived && (
                  <div className="relative flex-shrink-0">
                    <ChatInput
                      ref={chatInputRef}
                      conversationId={conversationId}
                      hasExistingMessages={messages.length > 0}
                      isLoading={isLoading}
                      isStreaming={isStreaming}
                      placeholder={
                        isPrivateMode
                          ? "Private mode: messages won't be saved..."
                          : "Ask me anything..."
                      }
                      onSendMessage={handleSendMessage}
                      onStop={() => {
                        // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
                        console.log(
                          "[UnifiedChatView] onStop called, forwarding to onStopGeneration"
                        );
                        onStopGeneration();
                      }}
                      onSendAsNewConversation={onSendAsNewConversation}
                      currentReasoningConfig={getCurrentReasoningConfig()}
                      currentTemperature={currentTemperature}
                      onTemperatureChange={onTemperatureChange}
                      messages={messages}
                    />
                  </div>
                )}

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
          open={confirmationDialog.state.isOpen}
          title={confirmationDialog.state.title}
          description={confirmationDialog.state.description}
          confirmText={confirmationDialog.state.confirmText}
          variant={confirmationDialog.state.variant}
          onConfirm={confirmationDialog.handleConfirm}
          onCancel={confirmationDialog.handleCancel}
          onOpenChange={confirmationDialog.handleOpenChange}
        />
      </div>
    );
  }
);

UnifiedChatView.displayName = "UnifiedChatView";
