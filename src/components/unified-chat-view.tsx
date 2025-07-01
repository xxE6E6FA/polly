import { useCallback, useEffect, useMemo, useRef, memo } from "react";

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
import { Button } from "./ui/button";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import { QuoteButton } from "./ui/quote-button";
import { Spinner } from "./spinner";
import {
  VirtualizedChatMessages,
  type VirtualizedChatMessagesRef,
} from "./virtualized-chat-messages";
import { type Id } from "../../convex/_generated/dataModel";
import { ArchiveIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type UnifiedChatViewProps = {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isStreaming: boolean;
  currentPersonaId: Id<"personas"> | null;
  canSavePrivateChat: boolean;
  hasApiKeys: boolean;
  isArchived?: boolean;
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
    currentPersonaId,
    canSavePrivateChat,
    hasApiKeys,
    isArchived,
    onSendMessage,
    onDeleteMessage,
    onEditMessage,
    onStopGeneration,
    onSavePrivateChat,
    onRetryUserMessage,
    onRetryAssistantMessage,
  }: UnifiedChatViewProps) => {
    const { isPrivateMode } = usePrivateMode();
    // Mutations
    const unarchiveConversation = useMutation(api.conversations.unarchive);

    // UI state and refs
    const virtualizedMessagesRef = useRef<VirtualizedChatMessagesRef>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<ChatInputRef>(null);
    const { selection, lockSelection, unlockSelection } = useTextSelection();
    const confirmationDialog = useConfirmationDialog();
    const hasInitializedScroll = useRef(false);
    const hasLoadedConversation = useRef(false);

    // Pass isStreaming to VirtualizedChatMessages so it knows when to apply scroll behavior
    const shouldScrollToBottom = useMemo(() => {
      return isStreaming; // Pass streaming state, but let VirtualizedChatMessages decide how to scroll
    }, [isStreaming]);

    // Remove the auto-scroll effect for streaming messages
    // The VirtualizedChatMessages component now handles this internally

    // Handle initial scroll to bottom when opening an existing conversation
    useEffect(() => {
      if (
        !isLoadingMessages &&
        messages.length > 0 &&
        !hasInitializedScroll.current &&
        virtualizedMessagesRef.current
      ) {
        // Scroll immediately without delay
        virtualizedMessagesRef.current.scrollToBottom();
        hasInitializedScroll.current = true;
      }
    }, [isLoadingMessages, messages.length]);

    // Reset scroll initialization when conversation changes
    useEffect(() => {
      hasInitializedScroll.current = false;
    }, [conversationId]);

    // Track when we've successfully loaded any conversation
    useEffect(() => {
      if (!isLoadingMessages && messages.length > 0) {
        hasLoadedConversation.current = true;
      }
    }, [isLoadingMessages, messages.length]);

    // Remove the effect that scrolls when user sends a message
    // This is now handled inside VirtualizedChatMessages

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

    const handleUnarchive = useCallback(async () => {
      if (!conversationId) return;

      try {
        await unarchiveConversation({ id: conversationId });
        const { toast } = await import("sonner");
        toast.success("Conversation restored", {
          description: "You can now continue chatting.",
        });
      } catch (_error) {
        const { toast } = await import("sonner");
        toast.error("Failed to restore conversation", {
          description: "Unable to restore conversation. Please try again.",
        });
      }
    }, [conversationId, unarchiveConversation]);

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
                        isArchived={isArchived}
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
                    // Show spinner on initial load, blank content when switching conversations
                    hasLoadedConversation.current ? (
                      <div className="h-full" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Spinner size="lg" />
                      </div>
                    )
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
                        isPrivateMode || isArchived
                          ? undefined
                          : handleDeleteMessage
                      }
                      onEditMessage={
                        isPrivateMode || isArchived ? undefined : onEditMessage
                      }
                      onRetryUserMessage={
                        isArchived ? undefined : onRetryUserMessage
                      }
                      onRetryAssistantMessage={
                        isArchived ? undefined : onRetryAssistantMessage
                      }
                      scrollElement={null}
                      shouldScrollToBottom={shouldScrollToBottom}
                    />
                  )}
                </div>

                {/* Archived conversation banner - replaces chat input */}
                {isArchived && hasApiKeys && (
                  <div className="relative px-3 pb-2 pt-1 sm:px-6 sm:pb-3">
                    <div className="mx-auto w-full max-w-3xl">
                      <div className="flex items-center gap-3 rounded-xl border-2 border-amber-200/30 bg-gradient-to-br from-amber-50/80 to-orange-50/30 p-2.5 dark:border-amber-800/20 dark:from-amber-950/30 dark:to-orange-950/10 sm:p-3">
                        <ArchiveIcon className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="flex-1 text-sm text-amber-800 dark:text-amber-200">
                          This conversation is archived. Restore it to continue
                          chatting.
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 border-amber-600 bg-transparent text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-900/50"
                          onClick={handleUnarchive}
                        >
                          Restore Conversation
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

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
