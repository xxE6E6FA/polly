import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";

import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
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
      <div className="text-center space-y-2 max-w-md px-4">
        <p className="text-lg font-medium text-foreground">
          Start a conversation
        </p>
        <p className="text-sm text-muted-foreground">
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

    const [scrollState, setScrollRef] = useScrollDirection({
      hideThreshold: 80,
    });

    // Mouse-based header reveal state
    const [isMouseInHeaderArea, setIsMouseInHeaderArea] = useState(false);
    const headerRef = useRef<HTMLDivElement>(null);
    const mouseLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Handle mouse movement for header reveal
    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!headerRef.current || !scrollState.shouldHideHeader) {
          return;
        }

        const rect = headerRef.current.getBoundingClientRect();
        const isInArea = e.clientY <= rect.bottom + 20;

        if (isInArea && !isMouseInHeaderArea) {
          setIsMouseInHeaderArea(true);
          if (mouseLeaveTimeoutRef.current) {
            clearTimeout(mouseLeaveTimeoutRef.current);
            mouseLeaveTimeoutRef.current = null;
          }
        } else if (!isInArea && isMouseInHeaderArea) {
          mouseLeaveTimeoutRef.current = setTimeout(() => {
            setIsMouseInHeaderArea(false);
            mouseLeaveTimeoutRef.current = null;
          }, 300);
        }
      },
      [scrollState.shouldHideHeader, isMouseInHeaderArea]
    );

    // Set up mouse tracking
    useEffect(() => {
      if (scrollState.shouldHideHeader) {
        document.addEventListener("mousemove", handleMouseMove);
        return () => {
          document.removeEventListener("mousemove", handleMouseMove);
          if (mouseLeaveTimeoutRef.current) {
            clearTimeout(mouseLeaveTimeoutRef.current);
          }
        };
      }
    }, [scrollState.shouldHideHeader, handleMouseMove]);

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

    // Setup scroll ref
    useLayoutEffect(() => {
      if (messagesContainerRef.current) {
        setScrollRef(messagesContainerRef.current);
      }
    }, [setScrollRef]);

    const isEmpty = messages.length === 0;
    const isLoadingConversation = conversationId && isLoadingMessages;

    return (
      <div className="flex h-full">
        <div className="relative flex h-full flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <div className="relative flex h-full flex-col overflow-hidden">
              <div className="relative z-10 flex h-full flex-col">
                <div
                  ref={messagesContainerRef}
                  className={cn(
                    "flex-1 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-out scrollbar-gutter-stable",
                    shouldScrollToBottom && "scroll-smooth"
                  )}
                >
                  {isLoadingConversation ? (
                    <div className="space-y-1 pb-32 sm:space-y-2">
                      <div
                        ref={headerRef}
                        className={cn(
                          "sticky top-0 z-20 bg-background border-b border-border/30 transition-transform duration-300 ease-out pl-16 pr-4 lg:pr-6",
                          scrollState.shouldHideHeader &&
                            !isMouseInHeaderArea &&
                            "sm:-translate-y-full"
                        )}
                      >
                        <div className="flex h-16 items-center">
                          <ChatHeader
                            conversationId={conversationId}
                            isPrivateMode={isPrivateMode}
                            onSavePrivateChat={onSavePrivateChat}
                            canSavePrivateChat={canSavePrivateChat}
                            privateMessages={
                              isPrivateMode ? messages : undefined
                            }
                            privatePersonaId={
                              isPrivateMode
                                ? (currentPersonaId ?? undefined)
                                : undefined
                            }
                          />
                        </div>
                      </div>
                      <div className="flex-1" />
                    </div>
                  ) : isEmpty && !isPrivateMode && !conversationId ? (
                    <ChatZeroState />
                  ) : isEmpty ? (
                    <ConversationZeroState />
                  ) : (
                    <div className="h-full flex flex-col">
                      <div
                        ref={headerRef}
                        className={cn(
                          "sticky top-0 z-20 bg-background border-b border-border/30 transition-all duration-300 ease-out pl-16 pr-4 lg:pr-6 flex-shrink-0",
                          scrollState.shouldHideHeader &&
                            !isMouseInHeaderArea &&
                            "sm:-translate-y-full sm:-mb-16"
                        )}
                      >
                        <div className="flex h-16 items-center">
                          <ChatHeader
                            conversationId={conversationId}
                            isPrivateMode={isPrivateMode}
                            onSavePrivateChat={onSavePrivateChat}
                            canSavePrivateChat={canSavePrivateChat}
                            privateMessages={
                              isPrivateMode ? messages : undefined
                            }
                            privatePersonaId={
                              isPrivateMode
                                ? (currentPersonaId ?? undefined)
                                : undefined
                            }
                          />
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 relative">
                        <VirtualizedChatMessages
                          ref={virtualizedMessagesRef}
                          messages={messages}
                          isStreaming={isStreaming}
                          onDeleteMessage={
                            isPrivateMode ? undefined : handleDeleteMessage
                          }
                          onEditMessage={
                            isPrivateMode ? undefined : onEditMessage
                          }
                          onRetryUserMessage={onRetryUserMessage}
                          onRetryAssistantMessage={onRetryAssistantMessage}
                          scrollElement={null}
                          shouldScrollToBottom={shouldScrollToBottom}
                        />
                      </div>
                    </div>
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

        {messages.length > 1 && <ChatOutline messages={messages} />}

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
