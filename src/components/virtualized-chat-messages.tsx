import {
  memo,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";

import { useVirtualizer } from "@tanstack/react-virtual";

import { ChatMessage } from "@/components/chat-message";
import { ContextMessage } from "@/components/context-message";
import { type ChatMessage as ChatMessageType } from "@/types";

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

export type VirtualizedChatMessagesRef = {
  scrollToMessage: (messageId: string, headingId?: string) => void;
  scrollToBottom: () => void;
};

// Message item component
const MessageItem = memo(
  ({
    message,
    isStreaming,
    onEditMessage,
    onRetryUserMessage,
    onRetryAssistantMessage,
    onDeleteMessage,
  }: {
    message: ChatMessageType;
    isStreaming: boolean;
    onEditMessage?: (messageId: string, newContent: string) => void;
    onRetryUserMessage?: (messageId: string) => void;
    onRetryAssistantMessage?: (messageId: string) => void;
    onDeleteMessage?: (messageId: string) => void;
  }) => {
    return (
      <div className="px-4 sm:px-8">
        <div
          id={message.id}
          className="mx-auto w-full max-w-3xl pb-2 sm:pb-3"
          style={{ maxWidth: "48rem" }}
        >
          {message.role === "context" ? (
            <ContextMessage message={message} />
          ) : (
            <ChatMessage
              isStreaming={isStreaming}
              message={message}
              onDeleteMessage={onDeleteMessage}
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
      const parentRef = useRef<HTMLDivElement>(null);
      const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

      // Filter and sort messages
      const processedMessages = useMemo(() => {
        return messages
          .filter(message => {
            if (message.role === "system") {
              return false;
            }
            if (message.role === "assistant") {
              return message.content || message.reasoning;
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
      }, [messages]);

      // Create virtualizer - this automatically measures heights
      const virtualizer = useVirtualizer({
        count: processedMessages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => 200, []), // Memoized estimate function
        overscan: 5, // Render extra items for smoother scrolling
        measureElement:
          typeof window !== "undefined" &&
          navigator.userAgent.indexOf("Firefox") === -1
            ? undefined
            : element => element?.getBoundingClientRect().height, // Optimize for non-Firefox browsers
      });

      // Scroll to bottom function
      const scrollToBottomImmediate = useCallback(() => {
        if (!parentRef.current || processedMessages.length === 0) return;

        // Clear any pending scroll operations
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Scroll to last item using virtualizer
        const lastIndex = processedMessages.length - 1;
        virtualizer.scrollToIndex(lastIndex, {
          align: "end",
          behavior: "auto",
        });

        // Then ensure we're at the absolute bottom
        scrollTimeoutRef.current = setTimeout(() => {
          if (parentRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
          }
        }, 50);
      }, [processedMessages.length, virtualizer]);

      // Scroll to message function
      const scrollToMessageImmediate = useCallback(
        (messageId: string, headingId?: string) => {
          const messageIndex = processedMessages.findIndex(
            msg => msg.id === messageId
          );

          if (messageIndex === -1) return;

          // Clear any pending scroll operations
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }

          // Scroll to message using virtualizer
          virtualizer.scrollToIndex(messageIndex, {
            align: "start",
            behavior: "auto",
          });

          if (headingId) {
            // For heading navigation, wait for the message to render
            // then scroll to the specific heading
            scrollTimeoutRef.current = setTimeout(() => {
              const headingElement = document.getElementById(headingId);
              const scrollContainer = parentRef.current;

              if (headingElement && scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const headingRect = headingElement.getBoundingClientRect();

                // Calculate offset with padding for better UX
                const offset =
                  headingRect.top -
                  containerRect.top +
                  scrollContainer.scrollTop -
                  80; // Offset for header

                scrollContainer.scrollTo({
                  top: Math.max(0, offset),
                  behavior: "auto",
                });
              } else {
                // If heading not found, try again after a short delay
                setTimeout(() => {
                  const retryHeadingElement =
                    document.getElementById(headingId);
                  if (retryHeadingElement && scrollContainer) {
                    const containerRect =
                      scrollContainer.getBoundingClientRect();
                    const headingRect =
                      retryHeadingElement.getBoundingClientRect();

                    const offset =
                      headingRect.top -
                      containerRect.top +
                      scrollContainer.scrollTop -
                      80;

                    scrollContainer.scrollTo({
                      top: Math.max(0, offset),
                      behavior: "auto",
                    });
                  }
                }, 100);
              }
            }, 50);
          }
        },
        [processedMessages, virtualizer]
      );

      // Expose scroll methods via ref
      useImperativeHandle(
        ref,
        () => ({
          scrollToMessage: scrollToMessageImmediate,
          scrollToBottom: scrollToBottomImmediate,
        }),
        [scrollToMessageImmediate, scrollToBottomImmediate]
      );

      // Handle shouldScrollToBottom prop
      useEffect(() => {
        if (shouldScrollToBottom && processedMessages.length > 0) {
          scrollToBottomImmediate();
        }
      }, [
        shouldScrollToBottom,
        scrollToBottomImmediate,
        processedMessages.length,
      ]);

      // Cleanup timeouts
      useEffect(() => {
        return () => {
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
        };
      }, []);

      if (processedMessages.length === 0) {
        return (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        );
      }

      const items = virtualizer.getVirtualItems();

      return (
        <div
          ref={parentRef}
          className="h-full overflow-auto"
          style={{
            contain: "strict",
          }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {items.map(virtualItem => {
              const message = processedMessages[virtualItem.index];
              const isMessageStreaming =
                isStreaming &&
                virtualItem.index === processedMessages.length - 1 &&
                message.role === "assistant" &&
                !message.metadata?.finishReason &&
                !message.metadata?.stopped;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <MessageItem
                    message={message}
                    isStreaming={!!isMessageStreaming}
                    onEditMessage={onEditMessage}
                    onRetryUserMessage={onRetryUserMessage}
                    onRetryAssistantMessage={onRetryAssistantMessage}
                    onDeleteMessage={onDeleteMessage}
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  )
);

VirtualizedChatMessages.displayName = "VirtualizedChatMessages";
