import type { Id } from "@convex/_generated/dataModel";
import { memo, useCallback, useMemo } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatOutline } from "@/components/chat-outline";
import { ChatZeroState } from "@/components/chat-zero-state";
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
import { WarningBanners } from "../chat-input/warning-banners";
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
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onRetryImageGeneration?: (messageId: string) => void;
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
    onRefineMessage,
    onRetryImageGeneration,
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
    const userMessageContents = useMemo(
      () =>
        messages
          .filter(m => m.role === "user")
          .map(m => m.content)
          .reverse(),
      [messages]
    );

    const handleStop = useCallback(() => {
      onStopGeneration();
    }, [onStopGeneration]);

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
      "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 8px, rgba(0,0,0,0.8) 16px, rgba(0,0,0,1) 20px, rgba(0,0,0,1) calc(100% - 20px), rgba(0,0,0,0.8) calc(100% - 16px), rgba(0,0,0,0.3) calc(100% - 8px), transparent 100%)";

    const renderMessageArea = () => {
      if (isEmpty) {
        if (!(isPrivateMode || conversationId)) {
          return <ChatZeroState />;
        }
        if (isPrivateMode) {
          return <ConversationZeroState />;
        }
        // For regular conversations that are empty, show empty state (no loading)
        return <div className="h-full" />;
      }

      return (
        <VirtualizedChatMessages
          ref={virtualizedMessagesRef}
          messages={messages}
          isStreaming={isStreaming}
          isLoading={isLoading}
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
          onRefineMessage={isArchived ? undefined : onRefineMessage}
          onRetryImageGeneration={
            isArchived ? undefined : onRetryImageGeneration
          }
          scrollElement={null}
          shouldScrollToBottom={isStreaming}
        />
      );
    };

    return (
      <div className="flex h-full">
        <div className="relative flex h-full flex-1 flex-col overflow-y-hidden overflow-x-visible">
          <div className="flex-1 overflow-y-hidden overflow-x-visible">
            <div className="relative flex h-full flex-col overflow-y-hidden overflow-x-visible">
              <div className="relative z-10 flex h-full flex-col overflow-y-hidden overflow-x-visible">
                {/* Static Header - always visible */}
                <div className="sticky top-0 z-20 h-12 flex-shrink-0 bg-background">
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

                <div
                  ref={messagesContainerRef}
                  className={cn(
                    "flex-1 overflow-y-hidden overflow-x-visible",
                    isEmpty && "overflow-y-auto"
                  )}
                  style={
                    // Avoid costly mask on small screens (mobile)
                    window.innerWidth < 768
                      ? undefined
                      : {
                          maskImage: maskGradient,
                          // biome-ignore lint/style/useNamingConvention: CSS property requires PascalCase
                          WebkitMaskImage: maskGradient,
                        }
                  }
                >
                  {renderMessageArea()}
                </div>

                {/* Archived conversation banner */}
                <ArchivedBanner
                  isArchived={isArchived}
                  hasApiKeys={hasApiKeys}
                  onUnarchive={handleUnarchive}
                />

                {/* Usage warnings - moved here to avoid re-rendering input */}
                <div className="px-3 sm:px-6">
                  <WarningBanners hasExistingMessages={messages.length > 0} />
                </div>

                {/* Chat input and controls - always visible */}
                <div className="relative flex-shrink-0">
                  <ChatInput
                    ref={chatInputRef}
                    conversationId={conversationId}
                    hasExistingMessages={messages.length > 0}
                    isLoading={isLoading || !hasApiKeys}
                    isStreaming={isStreaming}
                    placeholder={
                      isPrivateMode
                        ? "Private mode: messages won't be saved..."
                        : isArchived
                          ? "This conversation is archived"
                          : "Ask me anything..."
                    }
                    onSendMessage={
                      hasApiKeys && !isArchived
                        ? handleSendMessage
                        : async () => {
                            // No-op when API keys not loaded or archived
                          }
                    }
                    onStop={handleStop}
                    onSendAsNewConversation={
                      hasApiKeys && !isArchived
                        ? onSendAsNewConversation
                        : undefined
                    }
                    currentReasoningConfig={getCurrentReasoningConfig()}
                    currentTemperature={currentTemperature}
                    onTemperatureChange={onTemperatureChange}
                    userMessageContents={userMessageContents}
                  />
                </div>

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
        {messages.length > 1 && !isStreaming && (
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
