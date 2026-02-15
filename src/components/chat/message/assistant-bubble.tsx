import { api } from "@convex/_generated/api";
import { IMAGE_GEN_MARKER } from "@shared/constants";
import { useQuery } from "convex/react";
import { Fragment, useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { useAssistantDisplayPhase } from "@/hooks";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import { CitationProvider } from "@/providers/citation-context";
import { useZenModeStore } from "@/stores/zen-mode-store";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { CitationsGallery } from "../citations-gallery";
import type { PersonaInfo } from "../virtualized-chat-messages";
import { AssistantLoadingState } from "./assistant-loading-state";
import { AttachmentStrip } from "./attachment-strip";
import type { ImageRetryParams } from "./image-actions";
import { ImageGenerationBubble } from "./image-generation-bubble";
import { MessageActions } from "./message-actions";
import { MessageError } from "./message-error";
import { ToolGeneratedImages } from "./tool-generated-images";

type AssistantBubbleProps = {
  conversationId?: string;
  message: ChatMessageType;
  persona?: PersonaInfo;
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
  persona,
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
      persona={persona}
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
  persona,
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

  // Split content on image-gen markers so images render inline at each position.
  // Each marker corresponds to one generateImage tool call.
  const contentSegments = useMemo(() => {
    if (!displayContent?.includes(IMAGE_GEN_MARKER)) {
      return null;
    }
    return displayContent.split(IMAGE_GEN_MARKER);
  }, [displayContent]);

  const hasImageSplit = contentSegments !== null;

  // Ordered generateImage tool calls (sorted by startedAt timestamp)
  const imageToolCalls = useMemo(
    () =>
      message.toolCalls
        ?.filter(tc => tc.name === "generateImage")
        .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)) ?? [],
    [message.toolCalls]
  );

  // Map tool calls to their corresponding attachments.
  // Uses toolCallId for robust matching - each attachment has a toolCallId that links
  // it to the specific tool call that created it. This handles duplicate prompts and
  // out-of-order completion correctly.
  const toolCallAttachments = useMemo(() => {
    const allGeneratedAttachments =
      message.attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) ?? [];

    return imageToolCalls.map(toolCall => {
      // Match attachment to tool call by toolCallId
      const matchingAttachment = allGeneratedAttachments.find(
        att => att.generatedImage?.toolCallId === toolCall.id
      );
      return matchingAttachment;
    });
  }, [message.attachments, imageToolCalls]);

  const mdClass = "text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8]";

  const messageContent = (
    <>
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
            {hasImageSplit ? (
              contentSegments.map((segment, i) => (
                <Fragment key={`${message.id}-seg-${i}`}>
                  {segment && (
                    <StreamingMarkdown
                      isStreaming={i === contentSegments.length - 1 && isActive}
                      messageId={`${message.id}-seg-${i}`}
                      className={mdClass}
                    >
                      {segment}
                    </StreamingMarkdown>
                  )}
                  {i < contentSegments.length - 1 && (
                    <div className="my-4">
                      <ToolGeneratedImages
                        toolCalls={imageToolCalls[i] ? [imageToolCalls[i]] : []}
                        attachments={
                          toolCallAttachments[i] ? [toolCallAttachments[i]] : []
                        }
                        isActive={isActive}
                        onPreviewFile={onPreviewFile}
                      />
                    </div>
                  )}
                </Fragment>
              ))
            ) : (
              <StreamingMarkdown
                isStreaming={isActive}
                messageId={message.id}
                className={mdClass}
              >
                {displayContent}
              </StreamingMarkdown>
            )}
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
            persona={persona}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="w-full">
      <div
        className="min-w-0 flex-1"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <AssistantLoadingState
          phase={phase}
          isActive={isActive}
          reasoning={message.reasoning}
          reasoningParts={message.reasoningParts}
          thinkingDurationMs={message.metadata?.thinkingDurationMs}
          toolCalls={message.toolCalls?.filter(
            tc => tc.name !== "generateImage"
          )}
          suppressSkeleton={message.toolCalls?.some(
            tc => tc.name === "generateImage"
          )}
        />
        {/* When no marker in content, show images before text (backward compat) */}
        {!hasImageSplit && (
          <ToolGeneratedImages
            toolCalls={message.toolCalls}
            attachments={message.attachments}
            isActive={isActive}
            onPreviewFile={onPreviewFile}
          />
        )}
        {messageContent}
      </div>
    </div>
  );
};
