import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Citations } from "@/components/citations";
import { Reasoning } from "@/components/reasoning";
import { SearchQuery } from "@/components/search-query";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { Button } from "@/components/ui/button";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { Spinner } from "../spinner";
import { AttachmentStrip } from "./AttachmentStrip";
import { ImageActions } from "./ImageActions";
import { ImageGenerationSkeleton } from "./ImageGenerationSkeleton";
import { ImageLoadingSkeleton } from "./ImageLoadingSkeleton";
import { ImageViewToggle } from "./ImageViewToggle";
import { MessageActions } from "./MessageActions";

type AssistantBubbleProps = {
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

// Popular model names for better display
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "black-forest-labs/flux-dev": "FLUX Dev",
  "black-forest-labs/flux-pro": "FLUX Pro",
  "black-forest-labs/flux-schnell": "FLUX Schnell",
  "stability-ai/sdxl": "SDXL",
  "playground-v2.5": "Playground v2.5",
};

// Helper functions for image display
const getAspectRatioClass = (aspectRatio: string) => {
  switch (aspectRatio) {
    case "1:1":
      return "aspect-square";
    case "16:9":
      return "aspect-video";
    case "9:16":
      return "aspect-[9/16]";
    case "4:3":
      return "aspect-[4/3]";
    case "3:4":
      return "aspect-[3/4]";
    default:
      return "aspect-square";
  }
};

const getSingleImageMaxWidth = (aspectRatio: string) => {
  switch (aspectRatio) {
    case "1:1":
      return "max-w-sm sm:max-w-md";
    case "16:9":
      return "max-w-lg sm:max-w-xl";
    case "9:16":
      return "max-w-xs sm:max-w-sm";
    case "4:3":
      return "max-w-md sm:max-w-lg";
    case "3:4":
      return "max-w-sm sm:max-w-md";
    default:
      return "max-w-sm sm:max-w-md";
  }
};

// Component for smooth image loading with skeleton transition
const ImageContainer = ({
  imageUrl,
  storageId,
  altText,
  aspectRatio,
  onClick,
  className,
}: {
  imageUrl: string;
  storageId?: Id<"_storage">;
  altText: string;
  aspectRatio?: string;
  onClick: (url: string) => void;
  className?: string;
}) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Get Convex storage URL if we have a storageId
  const convexUrl = useQuery(
    api.fileStorage.getFileUrl,
    storageId ? { storageId } : "skip"
  );

  // Use storage URL if available, otherwise fall back to original URL
  const actualImageUrl = storageId && convexUrl ? convexUrl : imageUrl;

  const aspectClass = getAspectRatioClass(aspectRatio || "1:1");
  const isSingleImage = className?.includes("single-image");
  const maxWidthClass = isSingleImage
    ? getSingleImageMaxWidth(aspectRatio || "1:1")
    : "";

  // Show loading skeleton if we're waiting for storage URL
  const showSkeleton =
    !isImageLoaded || (storageId && !convexUrl && convexUrl !== null);

  return (
    <div
      className={cn("relative w-full", aspectClass, maxWidthClass, className)}
    >
      {/* Skeleton background - always rendered */}
      <ImageLoadingSkeleton
        aspectRatio={aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4"}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showSkeleton ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Image overlay - constrained to same aspect ratio */}
      {actualImageUrl && (
        <button
          type="button"
          className={cn(
            "absolute inset-0 rounded-lg hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden cursor-zoom-in",
            showSkeleton ? "opacity-0" : "opacity-100"
          )}
          onClick={() => onClick(actualImageUrl)}
          aria-label="Click to view full size image"
        >
          <img
            src={actualImageUrl}
            alt={altText}
            className="w-full h-full object-cover rounded-lg shadow-lg"
            onLoad={() => setIsImageLoaded(true)}
            loading="lazy"
            decoding="async"
          />
        </button>
      )}
    </div>
  );
};

export const AssistantBubble = ({
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Memoized image lists derived from message
  const generatedImageAttachments = useMemo(
    () =>
      message.attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) || [],
    [message.attachments]
  );

  const outputUrls = useMemo(
    () => message.imageGeneration?.output || [],
    [message.imageGeneration]
  );

  const hasStoredImages = generatedImageAttachments.length > 0;
  const hasAnyGeneratedImages = hasStoredImages || outputUrls.length > 0;

  const imageAttachments = useMemo(() => {
    if (hasStoredImages) {
      return generatedImageAttachments;
    }
    return outputUrls.map(
      (url, index) =>
        ({
          type: "image" as const,
          name: `Generated Image ${index + 1}`,
          url,
          size: 0,
          generatedImage: {
            isGenerated: true,
            source: "replicate",
            model: message.imageGeneration?.metadata?.model,
            prompt: message.imageGeneration?.metadata?.prompt,
          },
        }) satisfies Attachment
    );
  }, [
    hasStoredImages,
    generatedImageAttachments,
    outputUrls,
    message.imageGeneration,
  ]);

  const reasoning = message.reasoning;
  const displayContent = message.content;
  const hasSearch = Boolean(message.metadata?.searchQuery);
  const isImageGeneration = Boolean(message.imageGeneration);
  const isThinking = message.status === "thinking" && !isImageGeneration;
  const isSearching = message.status === "searching";
  const isPdfReading = message.status === "reading_pdf";
  const isStreamingWithoutContent =
    message.status === "streaming" &&
    (!displayContent || displayContent.length === 0) &&
    !isImageGeneration;
  const hasReasoningText = Boolean(reasoning && reasoning.trim().length > 0);

  // Get the model name for display
  const getModelDisplayName = (modelId: string | undefined): string => {
    if (!modelId) {
      return "replicate";
    }
    return MODEL_DISPLAY_NAMES[modelId] || modelId;
  };

  return (
    <div className="w-full">
      <div className="min-w-0 flex-1">
        {/* Unified Loading Status Area - show only one loader at a time */}
        {(isSearching ||
          isPdfReading ||
          (isThinking && !hasReasoningText) ||
          (isStreamingWithoutContent && !hasReasoningText)) && (
          <div className="mb-2.5">
            {isSearching ? (
              <SearchQuery
                feature={message.metadata?.searchFeature}
                category={message.metadata?.searchCategory}
                citations={message.citations}
                isLoading={true}
              />
            ) : isPdfReading ? (
              <div className="text-sm text-muted-foreground py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Spinner className="h-3 w-3" />
                  <span>{message.statusText || "Reading PDF..."}</span>
                </div>
              </div>
            ) : isStreamingWithoutContent && !hasReasoningText ? (
              <div className="text-sm text-muted-foreground py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Spinner className="h-3 w-3" />
                  <span>Thinking...</span>
                </div>
              </div>
            ) : isThinking && !hasReasoningText ? (
              <div className="text-sm text-muted-foreground py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Spinner className="h-3 w-3" />
                  <span>Thinking...</span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {hasReasoningText && (
          <div className="mb-2.5">
            <Reasoning
              isLoading={isStreaming}
              reasoning={reasoning || ""}
              hasSearch={hasSearch}
            />
          </div>
        )}

        {/* Handle image generation messages */}
        {message.imageGeneration ? (
          <div
            key={`imageGen-${message.id}-${message.imageGeneration.status}-${message.imageGeneration.output?.length || 0}-${message.attachments?.filter(att => att.type === "image" && att.generatedImage?.isGenerated).length || 0}`}
            className="mb-3"
          >
            {message.imageGeneration.status === "failed" ||
            message.imageGeneration.status === "canceled" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/50">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Image generation{" "}
                      {message.imageGeneration.status === "canceled"
                        ? "canceled"
                        : "failed"}
                    </h4>
                    {message.imageGeneration.error && (
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        {message.imageGeneration.error}
                      </p>
                    )}
                    {onRetryImageGeneration && (
                      <div className="mt-3">
                        <button
                          onClick={() => onRetryImageGeneration(message.id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 dark:bg-red-800/20 dark:text-red-200 dark:hover:bg-red-800/30"
                        >
                          <ArrowCounterClockwiseIcon className="h-3.5 w-3.5" />
                          Retry generation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : message.imageGeneration.status === "succeeded" &&
              hasAnyGeneratedImages ? (
              <ImageViewToggle
                images={
                  hasStoredImages
                    ? generatedImageAttachments.map(att => att.url)
                    : outputUrls
                }
                aspectRatio={
                  message.imageGeneration.metadata?.params?.aspectRatio
                }
                onImageClick={setPreviewImage}
                messageId={message.id}
                className="image-gallery-wrapper"
                gridComponent={(() => {
                  const items = hasStoredImages
                    ? generatedImageAttachments
                    : outputUrls.map(url => ({ url }));

                  return (
                    <div
                      className={cn(
                        "overflow-visible",
                        items.length === 1
                          ? "space-y-3 flex flex-col items-start"
                          : "grid gap-6",
                        items.length === 2 && "grid-cols-1 sm:grid-cols-2",
                        items.length === 3 &&
                          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                        items.length >= 4 && "grid-cols-1 sm:grid-cols-2"
                      )}
                    >
                      {items.map((item, index) => {
                        const attachment = hasStoredImages
                          ? (item as Attachment)
                          : null;
                        const url = hasStoredImages
                          ? (item as Attachment).url
                          : (item as { url: string }).url;

                        return (
                          <ImageContainer
                            key={`${message.id}-img-${index}`}
                            imageUrl={url}
                            storageId={
                              attachment?.storageId as
                                | Id<"_storage">
                                | undefined
                            }
                            altText={`Generated content ${index + 1}`}
                            aspectRatio={
                              message.imageGeneration?.metadata?.params
                                ?.aspectRatio
                            }
                            onClick={finalUrl => setPreviewImage(finalUrl)}
                            className={cn(
                              items.length === 1 ? "single-image" : "w-full"
                            )}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              />
            ) : (
              (() => {
                const count =
                  message.imageGeneration.metadata?.params?.count || 1;
                const aspectRatio =
                  message.imageGeneration.metadata?.params?.aspectRatio;

                if (count === 1) {
                  const maxWidthClass = getSingleImageMaxWidth(
                    aspectRatio || "1:1"
                  );
                  return (
                    <div className="flex flex-col items-start">
                      <div className={cn("w-full", maxWidthClass)}>
                        <ImageGenerationSkeleton
                          aspectRatio={
                            aspectRatio as
                              | "1:1"
                              | "16:9"
                              | "9:16"
                              | "4:3"
                              | "3:4"
                              | undefined
                          }
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    className={cn(
                      "grid gap-3",
                      count === 2 && "grid-cols-1 sm:grid-cols-2",
                      count === 3 &&
                        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                      count >= 4 && "grid-cols-1 sm:grid-cols-2"
                    )}
                  >
                    {Array.from({ length: count }).map((_, index) => (
                      <div
                        key={`skeleton-${message.id}-${index}`}
                        className="w-full max-w-sm"
                      >
                        <ImageGenerationSkeleton
                          aspectRatio={
                            aspectRatio as
                              | "1:1"
                              | "16:9"
                              | "9:16"
                              | "4:3"
                              | "3:4"
                              | undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          /* Regular text message content */
          <div className="relative">
            {(displayContent && displayContent.length > 0) || isStreaming ? (
              <StreamingMarkdown
                isStreaming={isStreaming || message.status === "streaming"}
                messageId={message.id}
              >
                {displayContent}
              </StreamingMarkdown>
            ) : null}

            {message.status === "error" && (
              <div className="mt-2 text-xs text-red-500">
                An error occurred while generating the response.
              </div>
            )}
          </div>
        )}

        {message.metadata?.stopped && !isStreaming && (
          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-400">
              <svg
                className="h-3 w-3"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium">Stopped by user</span>
            </div>
          </div>
        )}

        {message.citations &&
          message.citations.length > 0 &&
          (!isStreaming || message.content.length > 0) && (
            <Citations
              key={`citations-${message.id}-${isStreaming ? "streaming" : "complete"}`}
              citations={message.citations}
              messageId={message.id}
              content={message.content}
            />
          )}

        <AttachmentStrip
          attachments={message.attachments?.filter(
            att => !att.generatedImage?.isGenerated
          )}
          variant="assistant"
          onPreviewFile={onPreviewFile}
        />

        {/* Show image-specific actions for image generation messages */}
        {message.imageGeneration &&
        message.imageGeneration.status === "succeeded" &&
        (() => {
          const generatedImages =
            message.attachments?.filter(
              att => att.type === "image" && att.generatedImage?.isGenerated
            ) || [];
          const outputUrls = message.imageGeneration.output || [];
          return generatedImages.length > 0 || outputUrls.length > 0;
        })() ? (
          <div className="flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 ease-out">
            <div className="flex items-center gap-1">
              {/* Image Actions */}
              <ImageActions
                imageUrl={message.imageGeneration?.output?.[0] || ""}
                prompt={message.imageGeneration?.metadata?.prompt}
                onRetry={
                  onRetryImageGeneration
                    ? () => onRetryImageGeneration(message.id)
                    : undefined
                }
                className="gap-0"
              />

              {/* Delete message */}
              {onDeleteMessage && (
                <TooltipWrapper content="Delete message">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDeleteMessage}
                    disabled={isDeleting}
                    className="btn-action-destructive h-7 w-7 p-0"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipWrapper>
              )}
            </div>

            {/* Model name */}
            <span className="text-xs text-muted-foreground/70">
              {getModelDisplayName(
                message.imageGeneration?.metadata?.model || message.model
              )}
            </span>
          </div>
        ) : (
          /* Regular message actions for text messages */
          <MessageActions
            messageId={message.id}
            copyToClipboard={copyToClipboard}
            isCopied={isCopied}
            isDeleting={isDeleting}
            isRetrying={isRetrying}
            isStreaming={isStreaming}
            isUser={false}
            model={message.model}
            provider={message.provider}
            onDeleteMessage={onDeleteMessage}
            onRetryMessage={onRetryMessage}
            onRefineMessage={onRefineMessage}
          />
        )}

        {/* Image preview dialog */}
        {previewImage && (
          <AttachmentGalleryDialog
            attachments={imageAttachments}
            currentAttachment={
              imageAttachments.find(att => att.url === previewImage) || null
            }
            open={Boolean(previewImage)}
            onOpenChange={open => !open && setPreviewImage(null)}
            onAttachmentChange={attachment => setPreviewImage(attachment.url)}
          />
        )}
      </div>
    </div>
  );
};
