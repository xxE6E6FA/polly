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

      // Helper function to get the scroll container
      const getScrollContainer = useCallback(() => {
        // Find the scroll container by looking for the VList's rendered element
        // Virtua renders into a div with overflow auto
        const vlistElement = document.querySelector(
          '[style*="overflow: auto"][style*="height: 100%"]'
        );
        return vlistElement as HTMLElement | null;
      }, []);

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
        }),
        [processedMessages, getScrollContainer]
      );

      // Auto-scroll when messages change during streaming
      useEffect(() => {
        if (shouldScrollToBottom && processedMessages.length > 0) {
          // Virtua handles this automatically in reverse mode
          // Just ensure we're at the bottom
          const container = getScrollContainer();
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, [shouldScrollToBottom, getScrollContainer, processedMessages.length]);

      // Scroll to bottom when user sends a message
      useEffect(() => {
        if (
          messages.length > prevMessagesLengthRef.current &&
          messages.length > 0
        ) {
          const lastMessage = messages[messages.length - 1];
          // Check if the new message is from the user
          if (lastMessage?.role === "user") {
            // In reverse mode, Virtua should keep us at the bottom automatically
            // but we'll ensure it just in case
            const container = getScrollContainer();
            if (container) {
              container.scrollTop = container.scrollHeight;
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
