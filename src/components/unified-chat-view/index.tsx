import type { Id } from "@convex/_generated/dataModel";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatOutline } from "@/components/chat-outline";
import { ChatZeroState } from "@/components/chat-zero-state";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { QuoteButton } from "@/components/ui/quote-button";
import { VirtualizedChatMessages } from "@/components/virtualized-chat-messages";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useOnline } from "@/hooks/use-online";
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
    canSavePrivateChat,
    hasApiKeys,
    isArchived,
    onSendMessage,
    onSendAsNewConversation,
    onDeleteMessage,
    onEditMessage,
    onStopGeneration,
    onSavePrivateChat,
    onRetryUserMessage,
    onRetryAssistantMessage,
    onRefineMessage,
    onRetryImageGeneration,
  }: UnifiedChatViewProps) => {
    const { isPrivateMode } = usePrivateMode();
    const { temperature } = useChatScopedState(conversationId);

    // Conversation-level attachment gallery state
    const [previewAttachment, setPreviewAttachment] =
      useState<Attachment | null>(null);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    // Flatten all attachments across the conversation (user + assistant)
    const conversationAttachments: Attachment[] = useMemo(() => {
      const acc: Attachment[] = [];
      const seen = new Set<string>();
      for (const m of messages) {
        // Regular attachments
        const atts = m.attachments ?? [];
        for (const att of atts) {
          const key = `${att.storageId ?? ""}|${att.url ?? ""}|${att.name}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          acc.push(att);
        }
        // Generated images from imageGeneration.output that might not be in attachments
        if (m.imageGeneration?.status === "succeeded") {
          const hasStoredGenerated = (m.attachments ?? []).some(
            a => a.type === "image" && a.generatedImage?.isGenerated
          );
          // If images are already persisted as attachments, skip raw output URLs
          if (hasStoredGenerated) {
            continue;
          }
          const urls = m.imageGeneration.output ?? [];
          urls.forEach((url, idx) => {
            if (!url) {
              return;
            }
            const key = `gen|${url}`;
            if (seen.has(key)) {
              return;
            }
            seen.add(key);
            acc.push({
              type: "image",
              url,
              name: `Generated Image ${idx + 1}`,
              size: 0,
              generatedImage: {
                isGenerated: true,
                source: "replicate",
                model: m.imageGeneration?.metadata?.model,
                prompt: m.imageGeneration?.metadata?.prompt,
              },
            });
          });
        }
      }
      return acc;
    }, [messages]);

    const handlePreviewAttachment = useCallback((attachment: Attachment) => {
      setPreviewAttachment(attachment);
      setIsGalleryOpen(true);
    }, []);
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
    } = useChatViewState({
      conversationId,
      messages,
      isLoadingMessages,
      onDeleteMessage,
      onSendMessage,
    });
    const online = useOnline();
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
          temperature
        );
      },
      [onRetryUserMessage, temperature]
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
          temperature
        );
      },
      [onRetryAssistantMessage, temperature]
    );

    const ConversationZeroState = () => {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center stack-sm max-w-md px-4">
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

    const renderMessageArea = () => {
      if (isEmpty) {
        const insetStyle = {
          paddingTop: headerInset,
          paddingBottom: footerInset,
        };
        if (!(isPrivateMode || conversationId)) {
          return (
            <div
              className="flex h-full w-full items-center justify-center"
              style={insetStyle}
            >
              <ChatZeroState />
            </div>
          );
        }
        if (isPrivateMode) {
          return (
            <div
              className="flex h-full w-full items-center justify-center"
              style={insetStyle}
            >
              <ConversationZeroState />
            </div>
          );
        }
        // For regular conversations that are empty, show empty state (no loading)
        return <div className="h-full" style={insetStyle} />;
      }

      return (
        <VirtualizedChatMessages
          conversationId={conversationId as string | undefined}
          ref={virtualizedMessagesRef}
          messages={messages}
          isStreaming={isStreaming}
          isLoading={isLoading}
          onPreviewAttachment={handlePreviewAttachment}
          onDeleteMessage={
            isPrivateMode || isArchived || !online
              ? undefined
              : handleDeleteMessage
          }
          onEditMessage={
            isPrivateMode || isArchived || !online ? undefined : onEditMessage
          }
          onRetryUserMessage={
            isArchived || !online ? undefined : handleRetryUserMessage
          }
          onRetryAssistantMessage={
            isArchived || !online ? undefined : handleRetryAssistantMessage
          }
          onRefineMessage={isArchived ? undefined : onRefineMessage}
          onRetryImageGeneration={
            isArchived ? undefined : onRetryImageGeneration
          }
          scrollElement={null}
          shouldScrollToBottom={isStreaming}
          topInset={headerInset}
          bottomInset={footerInset}
        />
      );
    };

    const headerOverlayRef = useRef<HTMLElement | null>(null);
    const footerOverlayRef = useRef<HTMLDivElement | null>(null);
    const overlayScrollbarOffset = "calc(env(safe-area-inset-right) + 12px)";
    const handleMessagesContainerRef = useCallback(
      (node: HTMLDivElement | null) => {
        messagesContainerRef.current = node;
      },
      [messagesContainerRef]
    );

    const [headerInset, setHeaderInset] = useState(0);
    const [footerInset, setFooterInset] = useState(0);

    useEffect(() => {
      const updateInsets = () => {
        setHeaderInset(headerOverlayRef.current?.offsetHeight ?? 0);
        setFooterInset(footerOverlayRef.current?.offsetHeight ?? 0);
      };

      updateInsets();

      if (typeof window === "undefined") {
        return;
      }

      window.addEventListener("resize", updateInsets);

      let headerObserver: ResizeObserver | undefined;
      let footerObserver: ResizeObserver | undefined;

      if (typeof ResizeObserver !== "undefined") {
        headerObserver = new ResizeObserver(updateInsets);
        footerObserver = new ResizeObserver(updateInsets);

        if (headerOverlayRef.current) {
          headerObserver.observe(headerOverlayRef.current);
        }
        if (footerOverlayRef.current) {
          footerObserver.observe(footerOverlayRef.current);
        }
      }

      return () => {
        window.removeEventListener("resize", updateInsets);
        headerObserver?.disconnect();
        footerObserver?.disconnect();
      };
    }, []);

    return (
      <div className="flex h-full w-full min-h-0">
        <section className="relative flex h-full min-h-0 flex-1">
          <div className="relative flex h-full min-h-0 flex-1">
            <div
              ref={handleMessagesContainerRef}
              className={cn(
                "flex h-full w-full flex-col overflow-hidden",
                "[&_[data-vlist-id]]:overscroll-contain md:[&_[data-vlist-id]]:overscroll-auto",
                "[&_[data-vlist-id]]:scrollbar-thin"
              )}
            >
              {renderMessageArea()}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
              <header
                ref={headerOverlayRef}
                className="pointer-events-auto px-3 sm:px-6"
                style={{
                  paddingTop: "env(safe-area-inset-top)",
                  right: overlayScrollbarOffset,
                }}
              >
                <div className="flex w-full min-h-12 items-center rounded-b-xl bg-background sm:bg-transparent">
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
              </header>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
              <div
                ref={footerOverlayRef}
                className="pointer-events-auto px-3 pt-3 sm:px-6"
                style={{
                  right: overlayScrollbarOffset,
                }}
              >
                <div className="mx-auto w-full bg-background  max-w-3xl space-y-3">
                  <ArchivedBanner
                    isArchived={isArchived}
                    hasApiKeys={hasApiKeys}
                    onUnarchive={handleUnarchive}
                  />

                  <WarningBanners hasExistingMessages={messages.length > 0} />

                  <footer className="relative">
                    <ChatInput
                      ref={chatInputRef}
                      conversationId={conversationId}
                      hasExistingMessages={messages.length > 0}
                      isLoading={isLoading || !hasApiKeys}
                      isStreaming={isStreaming}
                      isArchived={isArchived}
                      isLikelyImageConversation={(() => {
                        if (!messages || messages.length === 0) {
                          return false;
                        }
                        for (let i = messages.length - 1; i >= 0; i--) {
                          const m = messages[i];
                          if (m.role === "assistant") {
                            if (m.imageGeneration) {
                              return true;
                            }
                            const hasGeneratedImage = (
                              m.attachments || []
                            ).some(
                              att =>
                                att.type === "image" &&
                                att.generatedImage?.isGenerated
                            );
                            return hasGeneratedImage;
                          }
                        }
                        return false;
                      })()}
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
                      userMessageContents={userMessageContents}
                      conversationPersonaId={currentPersonaId}
                    />
                  </footer>
                </div>
              </div>
            </div>

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
        </section>

        {messages.length > 1 && !isStreaming && (
          <ChatOutline messages={messages} onNavigate={handleOutlineNavigate} />
        )}

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

        <AttachmentGalleryDialog
          attachments={conversationAttachments}
          currentAttachment={previewAttachment}
          open={isGalleryOpen && !!previewAttachment}
          onOpenChange={open => {
            setIsGalleryOpen(open);
            if (!open) {
              setPreviewAttachment(null);
            }
          }}
          onAttachmentChange={setPreviewAttachment}
        />
      </div>
    );
  }
);

UnifiedChatView.displayName = "UnifiedChatView";
