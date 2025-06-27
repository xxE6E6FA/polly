import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { useTextSelection } from "@/hooks/use-text-selection";
import { cn } from "@/lib/utils";
import {
  type Attachment,
  type ChatMessage as ChatMessageType,
  type ConversationId,
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

type ConversationChatViewProps = {
  conversationId: ConversationId;
  messages: ChatMessageType[];
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isStreaming: boolean;
  hasApiKeys: boolean;
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onSendMessageToNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaPrompt?: string | null,
    personaId?: Id<"personas"> | null
  ) => Promise<ConversationId | undefined>;
  onEditMessage?: (messageId: string, content: string) => void;
  onRetryUserMessage?: (messageId: string) => void;
  onRetryAssistantMessage?: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onStopGeneration: () => void;
};

export const ConversationChatView = ({
  conversationId,
  messages,
  isLoading,
  isLoadingMessages,
  isStreaming,
  hasApiKeys,
  onSendMessage,
  onSendMessageToNewConversation,
  onEditMessage,
  onRetryUserMessage,
  onRetryAssistantMessage,
  onDeleteMessage,
  onStopGeneration,
}: ConversationChatViewProps) => {
  // UI state and refs
  const virtualizedMessagesRef = useRef<VirtualizedChatMessagesRef>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const { selection, addQuoteToInput, lockSelection, unlockSelection } =
    useTextSelection();
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
      if (!headerRef.current) {
        return;
      }

      const headerHeight = 64; // 16 * 4 = h-16 in pixels
      const triggerZone = headerHeight + 20; // Extra 20px buffer zone

      if (e.clientY <= triggerZone) {
        // Clear any pending hide timeout
        if (mouseLeaveTimeoutRef.current) {
          clearTimeout(mouseLeaveTimeoutRef.current);
          mouseLeaveTimeoutRef.current = null;
        }

        // Only set mouse in header area if header is currently hidden
        if (scrollState.shouldHideHeader && !isMouseInHeaderArea) {
          setIsMouseInHeaderArea(true);
        }
      } else if (isMouseInHeaderArea) {
        // Add a small delay before hiding to prevent flickering
        if (!mouseLeaveTimeoutRef.current) {
          mouseLeaveTimeoutRef.current = setTimeout(() => {
            setIsMouseInHeaderArea(false);
            mouseLeaveTimeoutRef.current = null;
          }, 300);
        }
      }
    },
    [scrollState.shouldHideHeader, isMouseInHeaderArea]
  );

  // Handle mouse leave from the viewport
  const handleMouseLeave = useCallback(() => {
    if (mouseLeaveTimeoutRef.current) {
      clearTimeout(mouseLeaveTimeoutRef.current);
      mouseLeaveTimeoutRef.current = null;
    }
    setIsMouseInHeaderArea(false);
  }, []);

  // Set up mouse event listeners
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    // Use the container for mouse events instead of document
    const handleContainerMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const handleContainerMouseLeave = () => handleMouseLeave();

    container.addEventListener("mousemove", handleContainerMouseMove);
    container.addEventListener("mouseleave", handleContainerMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleContainerMouseMove);
      container.removeEventListener("mouseleave", handleContainerMouseLeave);

      if (mouseLeaveTimeoutRef.current) {
        clearTimeout(mouseLeaveTimeoutRef.current);
      }
    };
  }, [handleMouseMove, handleMouseLeave]);

  // Set up scroll ref for virtualized container
  useEffect(() => {
    if (messages.length === 0 || !messagesContainerRef.current) {
      return;
    }

    // Find the virtualized scroll container
    const findScrollContainer = () => {
      const virtualizedContainer = messagesContainerRef.current?.querySelector(
        ".h-full.overflow-auto"
      );

      if (virtualizedContainer) {
        // Add scroll listener to reset mouse state
        const handleScrollStart = () => {
          // Reset mouse hover state when scrolling
          if (isMouseInHeaderArea) {
            setIsMouseInHeaderArea(false);
            if (mouseLeaveTimeoutRef.current) {
              clearTimeout(mouseLeaveTimeoutRef.current);
              mouseLeaveTimeoutRef.current = null;
            }
          }
        };

        virtualizedContainer.addEventListener("scroll", handleScrollStart, {
          passive: true,
        });
        setScrollRef(virtualizedContainer as HTMLElement);

        // Clean up on unmount
        return () => {
          virtualizedContainer.removeEventListener("scroll", handleScrollStart);
        };
      }
      return null;
    };

    // Try to find the container with retries
    let retryCount = 0;
    let cleanup: (() => void) | null = null;

    const tryFind = () => {
      cleanup = findScrollContainer();
      if (!cleanup && retryCount < 5) {
        retryCount++;
        setTimeout(tryFind, 100);
      }
    };

    tryFind();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [messages.length, setScrollRef, isMouseInHeaderArea]);

  const prevMessagesLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);

  // Reset initial load state when conversation changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
    setShouldScrollToBottom(false);
  }, [conversationId]);

  // Reset scroll to bottom flag after it's been used
  useEffect(() => {
    if (shouldScrollToBottom) {
      // Reset the flag after a longer delay to ensure virtualized component has time to scroll
      const timer = setTimeout(() => setShouldScrollToBottom(false), 200);
      return () => clearTimeout(timer);
    }
  }, [shouldScrollToBottom]);

  useLayoutEffect(() => {
    if (isInitialLoadRef.current && messages.length > 0 && !isLoading) {
      // Signal to scroll to bottom when messages first load (including when switching conversations)
      setShouldScrollToBottom(true);
      isInitialLoadRef.current = false;

      // Also use the dedicated scroll method as a more reliable fallback
      requestAnimationFrame(() => {
        virtualizedMessagesRef.current?.scrollToBottom();
      });
    }

    // Detect new messages and scroll to bottom
    if (
      !isInitialLoadRef.current &&
      messages.length > prevMessagesLengthRef.current &&
      messages.length > 0
    ) {
      const lastMessage = messages[messages.length - 1];
      const lastUserMessage = [...messages]
        .reverse()
        .find(m => m.role === "user");

      // Scroll if:
      // 1. A new user message was added (we sent a message)
      // 2. OR the last message is from assistant (response to our message)
      if (lastUserMessage || lastMessage.role === "assistant") {
        setShouldScrollToBottom(true);
        requestAnimationFrame(() => {
          virtualizedMessagesRef.current?.scrollToBottom();
        });
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, isLoading]);

  useLayoutEffect(() => {
    return () => {
      if (mouseLeaveTimeoutRef.current) {
        clearTimeout(mouseLeaveTimeoutRef.current);
      }
    };
  }, []);

  const handleSendMessage = useCallback(
    (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (!hasApiKeys) {
        return;
      }

      onSendMessage(
        content,
        attachments,
        useWebSearch,
        personaId,
        reasoningConfig
      );

      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    },
    [onSendMessage, hasApiKeys]
  );

  const handleAddQuote = useCallback((quote: string) => {
    chatInputRef.current?.addQuote(quote);
  }, []);

  const handleQuoteSelection = useCallback(() => {
    addQuoteToInput(handleAddQuote);
  }, [addQuoteToInput, handleAddQuote]);

  const handleOutlineNavigate = useCallback(
    (messageId: string, headingId?: string) => {
      if (headingId) {
        const headingElement = document.getElementById(headingId);
        if (headingElement) {
          headingElement.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }

      virtualizedMessagesRef.current?.scrollToMessage(messageId);
    },
    [virtualizedMessagesRef]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      // Filter messages the same way as the UI does
      const visibleMessages = messages.filter(message => {
        if (message.role === "system") {
          return false;
        }
        if (message.role === "assistant") {
          return message.content || message.reasoning;
        }
        return true;
      });

      const isLastMessage = visibleMessages.length === 1;

      confirmationDialog.confirm(
        {
          title: isLastMessage ? "Delete Conversation" : "Delete Message",
          description: isLastMessage
            ? "This is the last message in the conversation. Deleting it will delete the entire conversation. This action cannot be undone."
            : `Are you sure you want to delete this message? This action cannot be undone.`,
          confirmText: "Delete",
          cancelText: "Cancel",
          variant: "destructive",
        },
        async () => {
          await onDeleteMessage(messageId);
        }
      );
    },
    [messages, confirmationDialog, onDeleteMessage]
  );

  const isEmpty = messages.length === 0;
  const isLoadingConversation = conversationId && isLoadingMessages;

  const shouldShowLoadingSpinner = useMemo(() => {
    if (!isLoading || messages.length === 0) {
      return false;
    }

    const lastMessage = messages[messages.length - 1];
    return !lastMessage.content && !lastMessage.reasoning;
  }, [isLoading, messages]);

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
                        <ChatHeader conversationId={conversationId} />
                      </div>
                    </div>
                    <div className="flex-1" />
                  </div>
                ) : isEmpty ? (
                  <ChatZeroState />
                ) : (
                  <div className="h-full flex flex-col">
                    <div
                      ref={headerRef}
                      className={cn(
                        "sticky top-0 z-20 bg-background border-b border-border/30 transition-transform duration-300 ease-out pl-16 pr-4 lg:pr-6 flex-shrink-0",
                        scrollState.shouldHideHeader &&
                          !isMouseInHeaderArea &&
                          "sm:-translate-y-full"
                      )}
                    >
                      <div className="flex h-16 items-center">
                        <ChatHeader conversationId={conversationId} />
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 relative">
                      <VirtualizedChatMessages
                        ref={virtualizedMessagesRef}
                        messages={messages}
                        isStreaming={isStreaming}
                        onEditMessage={onEditMessage}
                        onRetryUserMessage={onRetryUserMessage}
                        onRetryAssistantMessage={onRetryAssistantMessage}
                        onDeleteMessage={handleDeleteMessage}
                        scrollElement={null}
                        shouldScrollToBottom={shouldScrollToBottom}
                      />

                      {shouldShowLoadingSpinner && (
                        <div className="absolute bottom-0 left-0 right-0 flex justify-center px-4 py-2 bg-background/80 backdrop-blur-sm">
                          <div
                            className="mx-auto w-full max-w-3xl"
                            style={{ maxWidth: "48rem" }}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-transparent bg-gradient-tropical p-0.5">
                                <div className="h-full w-full rounded-full bg-background" />
                              </div>
                              <span className="text-sm text-muted-foreground">
                                Thinking...
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
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
                      isLoadingConversation
                        ? "Loading conversation..."
                        : "Ask me anything..."
                    }
                    onSendMessage={handleSendMessage}
                    onStop={onStopGeneration}
                    onSendMessageToNewConversation={
                      onSendMessageToNewConversation
                        ? async (
                            content: string,
                            shouldNavigate: boolean,
                            attachments?: Attachment[],
                            contextSummary?: string,
                            sourceConversationId?: string,
                            personaPrompt?: string | null,
                            personaId?: Id<"personas"> | null
                          ) => {
                            await onSendMessageToNewConversation(
                              content,
                              shouldNavigate,
                              attachments,
                              contextSummary,
                              sourceConversationId as ConversationId,
                              personaPrompt,
                              personaId
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {messages.length > 1 && (
        <ChatOutline messages={messages} onNavigate={handleOutlineNavigate} />
      )}

      {selection && (
        <QuoteButton
          rect={selection.rect}
          selectedText={selection.text}
          onLockSelection={lockSelection}
          onQuote={handleQuoteSelection}
          onUnlockSelection={unlockSelection}
        />
      )}

      <ConfirmationDialog
        cancelText={confirmationDialog.options.cancelText}
        confirmText={confirmationDialog.options.confirmText}
        description={confirmationDialog.options.description}
        open={confirmationDialog.isOpen}
        title={confirmationDialog.options.title}
        variant={confirmationDialog.options.variant}
        onCancel={confirmationDialog.handleCancel}
        onConfirm={confirmationDialog.handleConfirm}
        onOpenChange={confirmationDialog.handleOpenChange}
      />
    </div>
  );
};
