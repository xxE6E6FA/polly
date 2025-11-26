import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CitationProvider } from "@/components/ui/citation-context";
import { SkeletonText } from "@/components/ui/skeleton-text";
import { Spinner } from "@/components/ui/spinner";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import { useZenModeStore } from "@/stores/zen-mode-store";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { CitationsGallery } from "../citations-gallery";
import { Reasoning } from "../reasoning";
import { AttachmentStrip } from "./attachment-strip";
import { ImageGenerationBubble } from "./image-generation-bubble";
import { MessageActions } from "./message-actions";
import { MessageError } from "./message-error";
import { useAssistantDisplayPhase } from "./use-assistant-display-phase";

type AssistantBubbleProps = {
  conversationId?: string;
  message: ChatMessageType;
  isStreaming?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
  onRetryImageGeneration?: (messageId: string) => void;
};

export const AssistantBubble = ({
  conversationId,
  message,
  isStreaming = false,
  isCopied,
  isRetrying,
  isDeleting,
  copyToClipboard,
  onRetryMessage,
  onRefineMessage,
  onDeleteMessage,
  onPreviewFile,
  onRetryImageGeneration,
}: AssistantBubbleProps) => {
  // Early return for image generation messages - delegate to dedicated component
  if (message.imageGeneration) {
    return (
      <ImageGenerationBubble
        conversationId={conversationId}
        message={message}
        isStreaming={isStreaming}
        isDeleting={isDeleting}
        onDeleteMessage={onDeleteMessage}
        onPreviewFile={onPreviewFile}
        onRetryImageGeneration={onRetryImageGeneration}
      />
    );
  }

  // Text message rendering below
  return (
    <TextMessageBubble
      conversationId={conversationId}
      message={message}
      isStreaming={isStreaming}
      isCopied={isCopied}
      isRetrying={isRetrying}
      isDeleting={isDeleting}
      copyToClipboard={copyToClipboard}
      onRetryMessage={onRetryMessage}
      onRefineMessage={onRefineMessage}
      onDeleteMessage={onDeleteMessage}
      onPreviewFile={onPreviewFile}
    />
  );
};

// Text message bubble component - handles all non-image-generation messages
const TextMessageBubble = ({
  conversationId,
  message,
  isStreaming = false,
  isCopied,
  isRetrying,
  isDeleting,
  copyToClipboard,
  onRetryMessage,
  onRefineMessage,
  onDeleteMessage,
  onPreviewFile,
}: Omit<AssistantBubbleProps, "onRetryImageGeneration">) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const [citationsExpanded, setCitationsExpanded] = useState(false);

  const conversationTitle = useQuery(
    api.conversations.getWithAccessInfo,
    conversationId ? { id: conversationId as Id<"conversations"> } : "skip"
  )?.conversation?.title;
  const openZenOverlay = useZenModeStore(s => s.open);

  // Use DB content directly
  const displayContent = message.content;
  const reasoning = message.reasoning;
  const displayCitations = message.citations?.map(c => ({
    type: "url_citation" as const,
    url: c.url,
    title: c.title || "",
  }));

  const hasTextContent = Boolean(
    displayContent && displayContent.trim().length > 0
  );
  const hasReasoningText = Boolean(reasoning && reasoning.trim().length > 0);
  const isZenModeAvailable = hasTextContent;
  const conversationKey = conversationId ?? null;

  const openZenMode = useCallback(() => {
    if (!isZenModeAvailable) {
      return;
    }
    openZenOverlay({
      conversationId: conversationKey,
      messageId: message.id,
      conversationTitle: conversationTitle || null,
    });
  }, [
    conversationTitle,
    conversationKey,
    isZenModeAvailable,
    message.id,
    openZenOverlay,
  ]);

  // Linger state to keep actions briefly visible after mouseout
  const {
    isVisible: showActions,
    onMouseEnter,
    onMouseLeave,
  } = useHoverLinger({ delay: 700 });

  const { phase, statusLabel } = useAssistantDisplayPhase({
    isStreamingProp: isStreaming || message.status === "streaming",
    messageStatus: message.status,
    contentLength: displayContent?.length || 0,
    hasReasoning: hasReasoningText,
  });

  const isMessageStreaming = isStreaming || message.status === "streaming";

  // Helper booleans for rendering
  const showPreContentStrip = phase === "precontent" && !!statusLabel;
  const showSkeleton = phase === "precontent" && !hasReasoningText;
  const showStreamingContent = phase === "streaming" || phase === "complete";

  // Auto-behavior for reasoning visibility:
  // - expand during precontent when reasoning arrives
  // - collapse shortly after actual content begins streaming to avoid layout shift
  useEffect(() => {
    if (hasReasoningText && phase === "precontent") {
      setShowReasoning(true);
    }
  }, [hasReasoningText, phase]);

  useEffect(() => {
    if (phase === "streaming" && showReasoning) {
      const t = setTimeout(() => setShowReasoning(false), 120);
      return () => clearTimeout(t);
    }
    return;
  }, [phase, showReasoning]);

  return (
    <div className="w-full">
      <div
        className="min-w-0 flex-1"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Pre-content: single status strip + optional skeleton, no stacking loaders */}
        {showPreContentStrip && (
          <div className="mb-2.5">
            {/* Minimal, consistent status pill */}
            <div className="text-sm text-foreground/80">
              <div className="inline-flex items-center gap-2">
                <Spinner className="h-3 w-3" />
                <span className="opacity-80">{statusLabel}</span>
              </div>
            </div>
          </div>
        )}

        {/* Reasoning panel: Grok-like card with header; no extra external toggle */}
        {hasReasoningText && (
          <div className="mb-2.5">
            <Reasoning
              isLoading={isStreaming}
              reasoning={reasoning || ""}
              expanded={showReasoning}
              onExpandedChange={setShowReasoning}
              // Show header toggle during answer streaming; hide only during precontent
              hideHeader={phase === "precontent"}
              finalDurationMs={message.metadata?.thinkingDurationMs}
            />
          </div>
        )}

        {/* Regular text message content with skeleton → content crossfade */}
        <div className="relative">
          {/* Skeleton block to reserve space before first chunk */}
          {showSkeleton && <SkeletonText lines={3} className="max-w-[74ch]" />}

          {/* Crossfade to content when streaming starts or completes */}
          {showStreamingContent && (
            <div
              className={cn(
                "transition-opacity duration-150",
                showSkeleton ? "opacity-0" : "opacity-100"
              )}
            >
              <CitationProvider
                citations={displayCitations || []}
                messageId={message.id}
              >
                <StreamingMarkdown
                  isStreaming={isMessageStreaming}
                  messageId={message.id}
                  className="text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8] max-w-[74ch]"
                >
                  {displayContent}
                </StreamingMarkdown>
              </CitationProvider>
            </div>
          )}

          {message.status === "error" && message.error && (
            <MessageError
              message={message}
              messageId={message.id}
              onRetry={onRetryMessage}
            />
          )}
        </div>

        {(message.metadata?.stopped ||
          message.metadata?.finishReason === "user_stopped") &&
          !isStreaming && (
            <Alert variant="danger" className="my-2">
              <AlertDescription>Stopped by user</AlertDescription>
            </Alert>
          )}

        {/* Defer citations until content has begun to reduce early reflow */}
        {displayCitations &&
          displayCitations.length > 0 &&
          (phase === "streaming" || phase === "complete") && (
            <CitationsGallery
              key={`citations-${message.id}-${phase}`}
              citations={displayCitations}
              messageId={message.id}
              content={displayContent}
              isExpanded={citationsExpanded}
            />
          )}

        <AttachmentStrip
          attachments={message.attachments?.filter(
            att => !att.generatedImage?.isGenerated
          )}
          variant="assistant"
          onPreviewFile={onPreviewFile}
        />

        {/* Message actions for text messages; keep a reserved row to avoid shifts */}
        <div className="mt-2" style={{ minHeight: 28 }}>
          <div
            className={cn(
              "transition-opacity duration-150",
              phase === "precontent" ? "opacity-0" : "opacity-100"
            )}
          >
            <MessageActions
              conversationId={conversationId}
              messageId={message.id}
              copyToClipboard={copyToClipboard}
              isCopied={isCopied}
              isDeleting={isDeleting}
              isRetrying={isRetrying}
              isStreaming={isStreaming}
              isUser={false}
              model={message.model}
              provider={message.provider}
              forceVisible={showActions}
              onDeleteMessage={onDeleteMessage}
              onRetryMessage={onRetryMessage}
              onRefineMessage={onRefineMessage}
              onOpenZenMode={isZenModeAvailable ? openZenMode : undefined}
              citations={message.citations}
              citationsExpanded={citationsExpanded}
              onToggleCitations={() => setCitationsExpanded(!citationsExpanded)}
              metadata={message.metadata}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
