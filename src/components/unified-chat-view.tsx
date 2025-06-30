import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  memo,
} from "react";

import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useTextSelection } from "@/hooks/use-text-selection";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { cn } from "@/lib/utils";
import {
  type Attachment,
  type ConversationId,
  type ChatMessage,
} from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";

import { ChatHeader } from "./chat-header";
import { ChatInput, type ChatInputRef } from "./chat-input";
import { ChatOutline } from "./chat-outline";
import { ChatZeroState } from "./chat-zero-state";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import { QuoteButton } from "./ui/quote-button";
import {
  VirtualizedChatMessages,
  type VirtualizedChatMessagesRef,
} from "./virtualized-chat-messages";
import { type Id } from "../../convex/_generated/dataModel";

type UnifiedChatViewProps = {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isStreaming: boolean;
  hasStreamingContent: boolean;
  currentPersonaId: Id<"personas"> | null;
  canSavePrivateChat: boolean;
  hasApiKeys: boolean;
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onStopGeneration: () => void;
  onSavePrivateChat?: () => Promise<void>;
  onRetryUserMessage?: (messageId: string) => void;
  onRetryAssistantMessage?: (messageId: string) => void;
};

/**
 * Simple zero state for conversation views (including private mode)
 */
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

/**
 * Unified Chat View Component
 *
 * This component handles both regular (Convex-backed) and private (local-only) chat modes.
 * The mode is determined by the global private mode context.
 *
 * Key benefits:
 * - Single component for both chat modes
 * - No conditional rendering based on mode
 * - Consistent UI/UX across modes
 * - Simplified prop passing
 */
export const UnifiedChatView = memo(
  ({
    conversationId,
    messages,
    isLoading,
    isLoadingMessages,
    isStreaming,
    hasStreamingContent,
    currentPersonaId,
    canSavePrivateChat,
    hasApiKeys,
    onSendMessage,
    onDeleteMessage,
    onEditMessage,
    onStopGeneration,
    onSavePrivateChat,
    onRetryUserMessage,
    onRetryAssistantMessage,
  }: UnifiedChatViewProps) => {
    const { isPrivateMode } = usePrivateMode();
    // UI state and refs
    const virtualizedMessagesRef = useRef<VirtualizedChatMessagesRef>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<ChatInputRef>(null);
    const { selection, lockSelection, unlockSelection } = useTextSelection();
    const confirmationDialog = useConfirmationDialog();
    const hasInitializedScroll = useRef(false);
    const previousMessageCount = useRef(messages.length);

    const shouldScrollToBottom = useMemo(() => {
      return isStreaming || hasStreamingContent;
    }, [isStreaming, hasStreamingContent]);

    // Auto-scroll effect when messages change
    useLayoutEffect(() => {
      if (shouldScrollToBottom && messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }, [messages, shouldScrollToBottom]);

    // Handle initial scroll to bottom when opening an existing conversation
    useEffect(() => {
      if (
        !isLoadingMessages &&
        messages.length > 0 &&
        !hasInitializedScroll.current &&
        virtualizedMessagesRef.current
      ) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          virtualizedMessagesRef.current?.scrollToBottom();
          hasInitializedScroll.current = true;
        }, 100);
      }
    }, [isLoadingMessages, messages.length]);

    // Reset scroll initialization when conversation changes
    useEffect(() => {
      hasInitializedScroll.current = false;
    }, [conversationId]);

    // Scroll to bottom when a new user message is added
    useEffect(() => {
      if (
        messages.length > previousMessageCount.current &&
        messages.length > 0
      ) {
        const lastMessage = messages[messages.length - 1];
        // Check if the new message is from the user
        if (lastMessage?.role === "user" && virtualizedMessagesRef.current) {
          // Small delay to ensure the message is rendered
          setTimeout(() => {
            virtualizedMessagesRef.current?.scrollToBottom();
          }, 50);
        }
      }
      previousMessageCount.current = messages.length;
    }, [messages]);

    // Handle outline navigation
    const handleOutlineNavigate = useCallback(
      (messageId: string, headingId?: string) => {
        if (virtualizedMessagesRef.current) {
          virtualizedMessagesRef.current.scrollToMessage(messageId, headingId);
        }
      },
      []
    );

    // Handle message sending
    const handleSendMessage = useCallback(
      async (
        content: string,
        attachments?: Attachment[],
        useWebSearch?: boolean,
        personaId?: Id<"personas"> | null,
        reasoningConfig?: ReasoningConfig
      ) => {
        await onSendMessage(
          content,
          attachments,
          useWebSearch,
          personaId,
          reasoningConfig
        );

        // Refocus the textarea after sending
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 0);
      },
      [onSendMessage]
    );

    const handleDeleteMessage = useCallback(
      (messageId: string) => {
        confirmationDialog.confirm(
          {
            title: "Delete message",
            description: "Are you sure you want to delete this message?",
            confirmText: "Delete",
            variant: "destructive",
          },
          () => onDeleteMessage(messageId)
        );
      },
      [confirmationDialog, onDeleteMessage]
    );

    const handleQuoteSelection = useCallback(() => {
      if (selection?.text && chatInputRef.current) {
        lockSelection();
        chatInputRef.current.addQuote(selection.text);
      }
    }, [selection?.text, lockSelection]);

    useEffect(() => {
      unlockSelection();
    }, [unlockSelection]);

    const isEmpty = messages.length === 0;
    const isLoadingConversation = conversationId && isLoadingMessages;

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
                        isPrivateMode={isPrivateMode}
                        onSavePrivateChat={onSavePrivateChat}
                        canSavePrivateChat={canSavePrivateChat}
                        privateMessages={isPrivateMode ? messages : undefined}
                        privatePersonaId={
                          isPrivateMode
                            ? (currentPersonaId ?? undefined)
                            : undefined
                        }
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
                  {isLoadingConversation ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Loading conversation...
                        </p>
                      </div>
                    </div>
                  ) : isEmpty && !isPrivateMode && !conversationId ? (
                    <ChatZeroState />
                  ) : isEmpty ? (
                    <ConversationZeroState />
                  ) : (
                    <VirtualizedChatMessages
                      ref={virtualizedMessagesRef}
                      messages={messages}
                      isStreaming={isStreaming}
                      onDeleteMessage={
                        isPrivateMode ? undefined : handleDeleteMessage
                      }
                      onEditMessage={isPrivateMode ? undefined : onEditMessage}
                      onRetryUserMessage={onRetryUserMessage}
                      onRetryAssistantMessage={onRetryAssistantMessage}
                      scrollElement={null}
                      shouldScrollToBottom={shouldScrollToBottom}
                    />
                  )}
                </div>

                {hasApiKeys && (
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
                          : isLoadingConversation
                            ? "Loading conversation..."
                            : "Ask me anything..."
                      }
                      onSendMessage={handleSendMessage}
                      onStop={onStopGeneration}
                    />

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
                )}
              </div>
            </div>
          </div>
        </div>

        {messages.length > 1 && (
          <ChatOutline messages={messages} onNavigate={handleOutlineNavigate} />
        )}

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
