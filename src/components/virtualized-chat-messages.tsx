import { type ChatMessage as ChatMessageType } from "@/types";
import { VList, type VListHandle } from "virtua";
import {
  memo,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { ChatMessage } from "@/components/chat-message";
import { ContextMessage } from "@/components/context-message";

type VirtualizedChatMessagesProps = {
  messages: ChatMessageType[];
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryUserMessage?: (messageId: string) => void;
  onRetryAssistantMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  scrollElement?: Element | null;
  shouldScrollToBottom?: boolean;
};

export interface VirtualizedChatMessagesRef {
  scrollToMessage: (messageId: string, headingId?: string) => void;
  scrollToBottom: () => void;
  scrollToShowAssistantStart: () => void;
}

interface MessageItemProps {
  message: ChatMessageType;
  isStreaming: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryUserMessage?: (messageId: string) => void;
  onRetryAssistantMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

const MessageItem = memo(
  ({
    message,
    isStreaming,
    onEditMessage,
    onRetryUserMessage,
    onRetryAssistantMessage,
    onDeleteMessage,
  }: MessageItemProps) => {
    return (
      <div className="px-4 sm:px-8">
        <div
          id={message.id}
          className="mx-auto w-full max-w-3xl pb-1 sm:pb-2"
          style={{ maxWidth: "48rem" }}
        >
          {message.role === "context" ? (
            <ContextMessage message={message} />
          ) : (
            <ChatMessage
              message={message}
              isStreaming={isStreaming}
              onEditMessage={
                message.role === "user" && onEditMessage
                  ? onEditMessage
                  : undefined
              }
              onRetryMessage={
                message.role === "user"
                  ? onRetryUserMessage
                  : onRetryAssistantMessage
              }
              onDeleteMessage={onDeleteMessage}
            />
          )}
        </div>
      </div>
    );
  }
);

MessageItem.displayName = "MessageItem";

export const VirtualizedChatMessages = memo(
  forwardRef<VirtualizedChatMessagesRef, VirtualizedChatMessagesProps>(
    (
      {
        messages,
        isStreaming,
        onEditMessage,
        onRetryUserMessage,
        onRetryAssistantMessage,
        onDeleteMessage,
        scrollElement: _scrollElement,
        shouldScrollToBottom = false,
      },
      ref
    ) => {
      const vlistRef = useRef<VListHandle>(null);
      const prevMessagesLengthRef = useRef(messages.length);
      const hasScrolledForCurrentAssistant = useRef(false);
      const lastAssistantMessageId = useRef<string | null>(null);

      // Generate a unique ID for this VList instance
      const vlistId = useMemo(
        () => `vlist-chat-${Math.random().toString(36).substr(2, 9)}`,
        []
      );

      // Filter and sort messages
      const processedMessages = useMemo(() => {
        return messages
          .filter(message => {
            if (message.role === "system") {
              return false;
            }
            if (message.role === "assistant") {
              // Include assistant messages if they have content, reasoning, or if we're streaming
              // This ensures empty assistant messages appear when streaming starts
              return (
                message.content ||
                message.reasoning ||
                (isStreaming && !message.metadata?.finishReason)
              );
            }
            return true;
          })
          .sort((a, b) => {
            if (a.role === "context" && b.role !== "context") {
              return -1;
            }
            if (b.role === "context" && a.role !== "context") {
              return 1;
            }
            return 0;
          });
      }, [messages, isStreaming]);

      // Helper function to get the scroll container
      const getScrollContainer = useCallback(() => {
        // Use the unique data attribute to reliably find the scroll container
        const vlistElement = document.querySelector(
          `[data-vlist-id="${vlistId}"]`
        );
        return vlistElement as HTMLElement | null;
      }, [vlistId]);

      // New method to scroll just enough to show the start of assistant message
      const scrollToShowAssistantStart = useCallback(() => {
        const container = getScrollContainer();
        if (!container) return;

        // Calculate the amount to scroll to show first 2-3 lines of assistant message
        const currentScrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const scrollHeight = container.scrollHeight;

        // If we're already at the bottom, don't scroll
        if (currentScrollTop + containerHeight >= scrollHeight - 10) {
          return;
        }

        // Scroll down by a fixed amount (roughly 100-150px for 2-3 lines)
        const scrollAmount = 120;
        const targetScrollTop = Math.min(
          currentScrollTop + scrollAmount,
          scrollHeight - containerHeight
        );

        container.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
      }, [getScrollContainer]);

      // Expose methods via ref
      useImperativeHandle(
        ref,
        () => ({
          scrollToMessage: (messageId: string, headingId?: string) => {
            const messageIndex = processedMessages.findIndex(
              msg => msg.id === messageId
            );
            if (messageIndex !== -1 && vlistRef.current) {
              vlistRef.current.scrollToIndex(messageIndex, {
                align: "start",
                smooth: false,
              });

              // If we have a headingId, we need to scroll to that specific heading
              // after the message is rendered
              if (headingId) {
                // Use MutationObserver to detect when the heading is rendered
                const observer = new MutationObserver((_mutations, obs) => {
                  const headingElement = document.getElementById(headingId);
                  if (headingElement) {
                    // Stop observing once we find the element
                    obs.disconnect();

                    const scrollContainer = getScrollContainer();
                    if (scrollContainer) {
                      // Use requestAnimationFrame for smooth timing
                      requestAnimationFrame(() => {
                        // Calculate the position of the heading relative to the scroll container
                        const containerRect =
                          scrollContainer.getBoundingClientRect();
                        const headingRect =
                          headingElement.getBoundingClientRect();

                        // Calculate the offset from the top of the container
                        const relativeTop = headingRect.top - containerRect.top;

                        // Scroll to put the heading near the top with some padding
                        const targetOffset =
                          scrollContainer.scrollTop + relativeTop - 80; // 80px padding from top

                        scrollContainer.scrollTo({
                          top: targetOffset,
                          behavior: "auto", // Instant scrolling
                        });
                      });
                    }
                  }
                });

                // Start observing the document body for changes
                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                });

                // Set a timeout to stop observing after 1 second as a failsafe
                setTimeout(() => {
                  observer.disconnect();
                }, 1000);
              }
            }
          },
          scrollToBottom: () => {
            const container = getScrollContainer();
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          },
          scrollToShowAssistantStart,
        }),
        [processedMessages, getScrollContainer, scrollToShowAssistantStart]
      );

      // Track when a new assistant message appears for scroll control
      useEffect(() => {
        if (processedMessages.length > 0) {
          const lastMessage = processedMessages[processedMessages.length - 1];

          // Check if this is a new assistant message
          if (
            lastMessage.role === "assistant" &&
            lastMessage.id !== lastAssistantMessageId.current
          ) {
            lastAssistantMessageId.current = lastMessage.id;
            hasScrolledForCurrentAssistant.current = false;
          }
        }
      }, [processedMessages]);

      // Modified auto-scroll logic for streaming
      useEffect(() => {
        if (!shouldScrollToBottom || processedMessages.length === 0) return;

        const lastMessage = processedMessages[processedMessages.length - 1];
        const container = getScrollContainer();

        if (!container) return;

        // For assistant messages, only do initial partial scroll
        if (lastMessage.role === "assistant") {
          // Only scroll once per assistant message when it first appears
          if (!hasScrolledForCurrentAssistant.current) {
            hasScrolledForCurrentAssistant.current = true;
            scrollToShowAssistantStart();
          }
          // Don't continue auto-scrolling after initial reveal
          return;
        }

        // For other cases, maintain existing behavior
        container.scrollTop = container.scrollHeight;
      }, [
        shouldScrollToBottom,
        getScrollContainer,
        processedMessages,
        scrollToShowAssistantStart,
      ]);

      // Scroll when user sends a message (to ensure assistant response is visible)
      useEffect(() => {
        if (
          messages.length > prevMessagesLengthRef.current &&
          messages.length > 0
        ) {
          const lastMessage = messages[messages.length - 1];
          // Check if the new message is from the user
          if (lastMessage?.role === "user") {
            const container = getScrollContainer();
            if (container) {
              // Scroll past the user message with extra space for assistant
              requestAnimationFrame(() => {
                const scrollHeight = container.scrollHeight;
                const containerHeight = container.clientHeight;
                // Add extra 150px of space for the incoming assistant message
                const targetScroll = scrollHeight - containerHeight + 150;
                container.scrollTo({
                  top: targetScroll,
                  behavior: "smooth",
                });
              });
            }
          }
        }
        prevMessagesLengthRef.current = messages.length;
      }, [messages, getScrollContainer]);

      // Initial scroll to bottom using Virtua's API
      useEffect(() => {
        if (processedMessages.length > 0 && vlistRef.current) {
          // Use Virtua's scrollToIndex with immediate behavior
          vlistRef.current.scrollToIndex(processedMessages.length - 1, {
            align: "end",
            smooth: false,
          });
        }
      }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Only run once on mount

      if (processedMessages.length === 0) {
        return (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        );
      }

      return (
        <VList
          ref={vlistRef}
          style={{
            height: "100%",
            width: "100%",
            overflow: "auto",
            contain: "strict",
            paddingTop: "24px",
          }}
          className="overscroll-contain"
          data-vlist-id={vlistId}
          reverse // This makes it a chat-like interface
          overscan={10}
        >
          {processedMessages.map((message, index) => {
            const isMessageStreaming =
              isStreaming &&
              index === processedMessages.length - 1 &&
              message.role === "assistant" &&
              !message.metadata?.finishReason &&
              !message.metadata?.stopped;

            return (
              <MessageItem
                key={message.id}
                message={message}
                isStreaming={!!isMessageStreaming}
                onEditMessage={onEditMessage}
                onRetryUserMessage={onRetryUserMessage}
                onRetryAssistantMessage={onRetryAssistantMessage}
                onDeleteMessage={onDeleteMessage}
              />
            );
          })}
        </VList>
      );
    }
  )
);

VirtualizedChatMessages.displayName = "VirtualizedChatMessages";
