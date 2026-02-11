import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { useAssistantDisplayPhase } from "@/hooks";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import { CitationProvider } from "@/providers/citation-context";
import { useZenModeStore } from "@/stores/zen-mode-store";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { CitationsGallery } from "../citations-gallery";
import { AssistantLoadingState } from "./assistant-loading-state";
import { AttachmentStrip } from "./attachment-strip";
import type { ImageRetryParams } from "./image-actions";
import { ImageGenerationBubble } from "./image-generation-bubble";
import { MessageActions } from "./message-actions";
import { MessageError } from "./message-error";

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
  onRetryImageGeneration?: (
    messageId: string,
    params: ImageRetryParams
  ) => void;
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
  const [citationsExpanded, setCitationsExpanded] = useState(false);

  const conversationTitle = useQuery(
    api.conversations.getBySlug,
    conversationId ? { slug: conversationId } : "skip"
  )?.conversation?.title;
  const openZenOverlay = useZenModeStore(s => s.open);

  // Use DB content directly
  const displayContent = message.content;

  const hasTextContent = Boolean(
    displayContent && displayContent.trim().length > 0
  );
  const hasReasoningText = Boolean(
    message.reasoning && message.reasoning.trim().length > 0
  );
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

  // Derive display phase from message status
  const { phase, isActive } = useAssistantDisplayPhase({
    messageStatus: message.status,
    hasContent: hasTextContent,
    hasReasoning: hasReasoningText,
  });

  // Visibility booleans
  const isLoading = phase === "loading";
  const showContent = phase === "streaming" || phase === "complete";

  return (
    <div className="w-full">
      <div
        className="min-w-0 flex-1"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Extracted loading state: activity stream + skeleton */}
        <AssistantLoadingState
          phase={phase}
          isActive={isActive}
          reasoning={message.reasoning}
          reasoningParts={message.reasoningParts}
          thinkingDurationMs={message.metadata?.thinkingDurationMs}
          toolCalls={message.toolCalls}
        />

        {/* Content area */}
        <div className="relative">
          {/* Content - visibility controlled via CSS */}
          <div
            className={cn(
              "transition-opacity duration-150",
              showContent
                ? "opacity-100"
                : "opacity-0 pointer-events-none absolute inset-0"
            )}
          >
            <CitationProvider
              citations={message.citations || []}
              messageId={message.id}
            >
              <StreamingMarkdown
                isStreaming={isActive}
                messageId={message.id}
                className="text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8]"
              >
                {displayContent}
              </StreamingMarkdown>
            </CitationProvider>
          </div>

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
          !isActive && (
            <Alert variant="danger" className="my-2">
              <AlertDescription>Stopped by user</AlertDescription>
            </Alert>
          )}

        {/* Defer citations until content has begun to reduce early reflow */}
        {message.citations && message.citations.length > 0 && showContent && (
          <CitationsGallery
            key={`citations-${message.id}-${phase}`}
            citations={message.citations}
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
        <div className="mt-2 min-h-7">
          <div
            className={cn(
              "transition-opacity duration-150",
              isLoading ? "opacity-0" : "opacity-100"
            )}
          >
            <MessageActions
              conversationId={conversationId}
              messageId={message.id}
              copyToClipboard={copyToClipboard}
              isCopied={isCopied}
              isDeleting={isDeleting}
              isRetrying={isRetrying}
              isStreaming={isActive}
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
