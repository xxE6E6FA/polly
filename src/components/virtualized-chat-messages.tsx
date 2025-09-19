import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { VList, type VListHandle } from "virtua";
import { ChatMessage } from "@/components/chat-message";
import { ContextMessage } from "@/components/context-message";
import { useStreamOverlays } from "@/stores/stream-overlays";
import { useZenModeStore } from "@/stores/zen-mode-store";
import type { ChatMessage as ChatMessageType } from "@/types";
import { ZenModeDialog } from "./chat-message/ZenModeDialog";

type VirtualizedChatMessagesProps = {
  messages: ChatMessageType[];
  isStreaming?: boolean;
  isLoading?: boolean;
  conversationId?: string;
  onPreviewAttachment?: (attachment: import("@/types").Attachment) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryUserMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string
  ) => void;
  onRetryAssistantMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string
  ) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryImageGeneration?: (messageId: string) => void;
  scrollElement?: Element | null;
  shouldScrollToBottom?: boolean;
  topInset?: number;
  bottomInset?: number;
};

export interface VirtualizedChatMessagesRef {
  scrollToMessage: (messageId: string, headingId?: string) => void;
  scrollToBottom: () => void;
  scrollToShowAssistantStart: () => void;
}

interface MessageItemProps {
  messageId: string;
  isStreaming: boolean;
  conversationId?: string;
  onPreviewAttachment?: (attachment: import("@/types").Attachment) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryUserMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string
  ) => void;
  onRetryAssistantMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string
  ) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryImageGeneration?: (messageId: string) => void;
  // Message selector for efficient re-renders
  messageSelector: (messageId: string) => ChatMessageType | undefined;
}

const isZenEligibleMessage = (message: ChatMessageType) => {
  if (message.role !== "assistant") {
    return false;
  }
  if (message.imageGeneration) {
    return false;
  }
  const text = message.content?.trim();
  return Boolean(text && text.length > 0);
};

const MessageItem = memo(
  ({
    messageId,
    isStreaming,
    conversationId,
    onPreviewAttachment,
    onEditMessage,
    onRetryUserMessage,
    onRetryAssistantMessage,
    onRefineMessage,
    onDeleteMessage,
    onRetryImageGeneration,
    messageSelector,
  }: MessageItemProps) => {
    const message = messageSelector(messageId);

    if (!message) {
      return null;
    }

    return (
      <div className="px-4 sm:px-8 overflow-visible">
        <div
          id={message.id}
          className="mx-auto w-full max-w-3xl pb-3 sm:pb-4 overflow-visible motion-safe:animate-message-in"
          style={{ maxWidth: "48rem" }}
        >
          {message.role === "context" ? (
            <ContextMessage message={message} />
          ) : (
            <ChatMessage
              conversationId={conversationId}
              message={message}
              isStreaming={isStreaming}
              onPreviewAttachment={onPreviewAttachment}
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
              onRefineMessage={onRefineMessage}
              onDeleteMessage={onDeleteMessage}
              onRetryImageGeneration={onRetryImageGeneration}
            />
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better performance during streaming
    if (prevProps.messageId !== nextProps.messageId) {
      return false;
    }

    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    // Check if the actual message content changed
    const prevMessage = prevProps.messageSelector(prevProps.messageId);
    const nextMessage = nextProps.messageSelector(nextProps.messageId);

    if (!(prevMessage && nextMessage)) {
      return false;
    }

    // Compare the properties that matter for rendering
    if (
      prevMessage.content !== nextMessage.content ||
      prevMessage.status !== nextMessage.status ||
      prevMessage.reasoning !== nextMessage.reasoning
    ) {
      return false;
    }

    // All callback functions should be stable, so we can do reference equality
    return (
      prevProps.onEditMessage === nextProps.onEditMessage &&
      prevProps.onRetryUserMessage === nextProps.onRetryUserMessage &&
      prevProps.onRetryAssistantMessage === nextProps.onRetryAssistantMessage &&
      prevProps.onDeleteMessage === nextProps.onDeleteMessage &&
      prevProps.onRetryImageGeneration === nextProps.onRetryImageGeneration &&
      prevProps.messageSelector === nextProps.messageSelector
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
        isLoading = false,
        conversationId,
        onPreviewAttachment,
        onEditMessage,
        onRetryUserMessage,
        onRetryAssistantMessage,
        onRefineMessage,
        onDeleteMessage,
        onRetryImageGeneration,
        scrollElement: _scrollElement,
        shouldScrollToBottom = false,
        topInset,
        bottomInset,
      },
      ref
    ) => {
      const vlistRef = useRef<VListHandle>(null);
      const prevMessagesLengthRef = useRef(messages.length);
      const hasScrolledForCurrentAssistant = useRef(false);
      const lastAssistantMessageId = useRef<string | null>(null);
      const hasInitialScrolled = useRef(false);

      // Create a memoized message selector for efficient lookups
      const messagesMap = useMemo(() => {
        const map = new Map<string, ChatMessageType>();
        for (const message of messages) {
          map.set(message.id, message);
        }
        return map;
      }, [messages]);

      // Overlay map for optimistic author-side streaming
      const overlays = useStreamOverlays(s => s.overlays);
      const reasoningOverlays = useStreamOverlays(s => s.reasoning);
      const statusOverlays = useStreamOverlays(s => s.status);
      const citationOverlays = useStreamOverlays(s => s.citations);

      const messageSelector = useCallback(
        (messageId: string) => {
          const base = messagesMap.get(messageId);
          if (!base) {
            return base;
          }
          const overlay = overlays[messageId];
          const overlayReasoning = reasoningOverlays[messageId];
          const overlayStatus = statusOverlays[messageId];
          const overlayCitations = citationOverlays[messageId];
          if (
            (overlay ||
              overlayReasoning ||
              overlayStatus ||
              overlayCitations) &&
            base.role === "assistant"
          ) {
            // Overlay rendered content for author while streaming via HTTP
            return {
              ...base,
              content: overlay ?? base.content,
              reasoning: overlayReasoning ?? base.reasoning,
              citations: overlayCitations ?? base.citations,
              // Ensure the message shows live status during overlay
              status:
                base.status === "done"
                  ? base.status
                  : overlayStatus || base.status || "streaming",
            } as ChatMessageType;
          }
          return base;
        },
        [
          messagesMap,
          overlays,
          reasoningOverlays,
          statusOverlays,
          citationOverlays,
        ]
      );

      // Generate a unique ID for this VList instance
      const vlistId = useMemo(
        () => `vlist-chat-${Math.random().toString(36).substr(2, 9)}`,
        []
      );

      // Filter and sort messages - optimized for streaming performance
      const processedMessages = useMemo(() => {
        const filtered = [];

        for (const message of messages) {
          if (message.role === "system") {
            continue;
          }

          if (message.role === "assistant") {
            // Include assistant messages if they have content, reasoning, image generation,
            // or if the message is not finalized yet according to status.
            // This ensures empty assistant messages appear when streaming starts
            // and disappear once marked done.
            const notFinalized = message.status !== "done";
            if (
              message.content ||
              message.reasoning ||
              message.imageGeneration ||
              notFinalized
            ) {
              filtered.push(message);
            }
          } else {
            filtered.push(message);
          }
        }

        // Sort with context messages first - more efficient than general sort
        const contextMessages = [];
        const otherMessages = [];

        for (const message of filtered) {
          if (message.role === "context") {
            contextMessages.push(message);
          } else {
            otherMessages.push(message);
          }
        }

        return [...contextMessages, ...otherMessages];
      }, [messages]);

      const assistantMessages = useMemo(() => {
        return processedMessages.filter(msg => msg.role === "assistant");
      }, [processedMessages]);

      // Adaptive overscan for mobile vs desktop to reduce work on mobile
      const overscan = useMemo(() => {
        if (typeof window === "undefined") {
          return 2;
        }
        const isMobile = window.innerWidth < 768;
        // Minimize initial work during conversation switches by rendering
        // only the closest items around the viewport. Increase slightly on desktop.
        if (isStreaming) {
          return isMobile ? 1 : 2;
        }
        return isMobile ? 1 : 3;
      }, [isStreaming]);

      // Helper function to get the scroll container
      const getScrollContainer = useCallback(() => {
        // Use the unique data attribute to reliably find the scroll container
        const vlistElement = document.querySelector(
          `[data-vlist-id="${vlistId}"]`
        );
        return vlistElement as HTMLElement | null;
      }, [vlistId]);

      useEffect(() => {
        const handleZenScroll = (event: Event) => {
          const customEvent = event as CustomEvent<{
            messageId?: string;
            conversationId?: string | null;
          }>;

          const payload = customEvent.detail;
          if (!payload?.messageId) {
            return;
          }

          if (
            conversationId &&
            payload.conversationId &&
            payload.conversationId !== conversationId
          ) {
            return;
          }

          const targetIndex = processedMessages.findIndex(
            msg => msg.id === payload.messageId
          );

          if (targetIndex === -1) {
            return;
          }

          if (vlistRef.current) {
            vlistRef.current.scrollToIndex(targetIndex, {
              align: "start",
              smooth: true,
            });
          }
        };

        window.addEventListener("polly:zen-scroll-to-message", handleZenScroll);
        return () => {
          window.removeEventListener(
            "polly:zen-scroll-to-message",
            handleZenScroll
          );
        };
      }, [conversationId, processedMessages]);

      // New method to scroll just enough to show the start of assistant message
      const scrollToShowAssistantStart = useCallback(() => {
        const container = getScrollContainer();
        if (!container) {
          return;
        }

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
            if (!container) {
              return;
            }
            if (typeof container.scrollTo === "function") {
              container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
              });
            } else {
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

        // Reset initial scroll flag when messages change significantly (new conversation)
        if (processedMessages.length !== prevMessagesLengthRef.current) {
          hasInitialScrolled.current = false;
        }
        prevMessagesLengthRef.current = processedMessages.length;
      }, [processedMessages]);

      // Auto-scroll logic for streaming messages
      useEffect(() => {
        if (!shouldScrollToBottom || processedMessages.length === 0) {
          return;
        }

        const lastMessage = processedMessages[processedMessages.length - 1];
        const container = getScrollContainer();

        if (!container) {
          return;
        }

        // Check if user is near the bottom (within 100px)
        const isNearBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;

        // For assistant messages, only do initial partial scroll
        if (lastMessage.role === "assistant") {
          // Only scroll once per assistant message when it first appears
          if (!hasScrolledForCurrentAssistant.current && isNearBottom) {
            hasScrolledForCurrentAssistant.current = true;
            scrollToShowAssistantStart();
          }
          // Don't continue auto-scrolling after initial reveal
          return;
        }

        // For other cases, only scroll if near bottom
        if (isNearBottom) {
          container.scrollTop = container.scrollHeight;
        }
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

      // Initial scroll to bottom when conversation first loads and messages are available
      useEffect(() => {
        if (
          processedMessages.length > 0 &&
          vlistRef.current &&
          !hasInitialScrolled.current &&
          !isLoading
        ) {
          hasInitialScrolled.current = true;
          // Use requestAnimationFrame to ensure the list has rendered
          requestAnimationFrame(() => {
            if (vlistRef.current) {
              vlistRef.current.scrollToIndex(processedMessages.length - 1, {
                align: "end",
                smooth: false,
              });
            }
          });
        }
      }, [processedMessages.length, isLoading]);

      if (processedMessages.length === 0) {
        return (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        );
      }

      const resolvedTopInset = Math.max((topInset ?? 0) + 12, 24);
      const resolvedBottomInset = Math.max(bottomInset ?? 20, 20);

      return (
        <>
          <VList
            ref={vlistRef}
            style={{
              height: "100%",
              width: "100%",
              overflow: "auto",
              contain: "layout style size",
              paddingTop: resolvedTopInset,
              paddingBottom: resolvedBottomInset,
              // biome-ignore lint/style/useNamingConvention: vendor-specific property
              WebkitOverflowScrolling: "touch",
            }}
            className="overscroll-contain scrollbar-thin"
            data-vlist-id={vlistId}
            reverse // This makes it a chat-like interface
            overscan={overscan}
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
                  messageId={message.id}
                  isStreaming={!!isMessageStreaming}
                  conversationId={conversationId}
                  onPreviewAttachment={onPreviewAttachment}
                  onEditMessage={onEditMessage}
                  onRetryUserMessage={onRetryUserMessage}
                  onRetryAssistantMessage={onRetryAssistantMessage}
                  onRefineMessage={onRefineMessage}
                  onDeleteMessage={onDeleteMessage}
                  onRetryImageGeneration={onRetryImageGeneration}
                  messageSelector={messageSelector}
                />
              );
            })}
          </VList>
          <ZenModeOverlay
            assistantMessages={assistantMessages}
            conversationId={conversationId}
          />
        </>
      );
    }
  )
);

VirtualizedChatMessages.displayName = "VirtualizedChatMessages";

type ZenModeOverlayProps = {
  assistantMessages: ChatMessageType[];
  conversationId?: string;
};

const ZenModeOverlay = ({
  assistantMessages,
  conversationId,
}: ZenModeOverlayProps) => {
  const zenIsOpen = useZenModeStore(s => s.isOpen);
  const zenConversationId = useZenModeStore(s => s.conversationId);
  const zenActiveMessageId = useZenModeStore(s => s.activeMessageId);
  const zenConversationTitle = useZenModeStore(s => s.conversationTitle);
  const closeZenMode = useZenModeStore(s => s.close);
  const setZenActiveMessage = useZenModeStore(s => s.setActive);

  const conversationKey = conversationId ?? null;

  const eligibleMessages = useMemo(
    () => assistantMessages.filter(isZenEligibleMessage),
    [assistantMessages]
  );

  const activeIndex = useMemo(() => {
    if (!zenActiveMessageId) {
      return -1;
    }
    return eligibleMessages.findIndex(msg => msg.id === zenActiveMessageId);
  }, [eligibleMessages, zenActiveMessageId]);

  const totalMessages = eligibleMessages.length;
  const hasMultipleMessages = totalMessages > 1;

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!hasMultipleMessages || activeIndex < 0) {
        return false;
      }
      const lastIndex = totalMessages - 1;
      let nextIndex = activeIndex;
      if (direction === "prev") {
        nextIndex = activeIndex === 0 ? lastIndex : activeIndex - 1;
      } else {
        nextIndex = activeIndex === lastIndex ? 0 : activeIndex + 1;
      }
      const nextMessage = eligibleMessages[nextIndex];
      if (!nextMessage) {
        return false;
      }
      setZenActiveMessage(nextMessage.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("polly:zen-scroll-to-message", {
            detail: {
              messageId: nextMessage.id,
              conversationId: conversationKey,
            },
          })
        );
      }
      return true;
    },
    [
      activeIndex,
      conversationKey,
      eligibleMessages,
      hasMultipleMessages,
      setZenActiveMessage,
      totalMessages,
    ]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeZenMode();
      }
    },
    [closeZenMode]
  );

  useEffect(() => {
    if (!zenIsOpen) {
      return;
    }
    if (zenConversationId !== conversationKey) {
      return;
    }
    if (eligibleMessages.length === 0) {
      closeZenMode();
      return;
    }
    const firstEligible = eligibleMessages[0];
    if (!zenActiveMessageId || activeIndex === -1) {
      setZenActiveMessage(firstEligible.id);
    }
  }, [
    zenIsOpen,
    zenConversationId,
    conversationKey,
    eligibleMessages,
    zenActiveMessageId,
    activeIndex,
    closeZenMode,
    setZenActiveMessage,
  ]);

  if (
    !zenIsOpen ||
    zenConversationId !== conversationKey ||
    eligibleMessages.length === 0 ||
    activeIndex < 0
  ) {
    return null;
  }

  const activeMessage = eligibleMessages[activeIndex];
  const content = activeMessage.content ?? "";
  const citations = activeMessage.citations;
  const isStreaming = activeMessage.status === "streaming";
  const messageId = `${activeMessage.id}-zen`;
  const position = activeIndex + 1;

  return (
    <ZenModeDialog
      open
      onOpenChange={handleOpenChange}
      conversationTitle={zenConversationTitle || undefined}
      content={content}
      citations={citations}
      isStreaming={isStreaming}
      messageId={messageId}
      hasPrev={hasMultipleMessages}
      hasNext={hasMultipleMessages}
      onNavigate={hasMultipleMessages ? handleNavigate : undefined}
      position={position}
      totalMessages={totalMessages}
    />
  );
};
