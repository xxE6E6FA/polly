import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { CitationsGallery } from "@/components/citations-gallery";
import { Reasoning } from "@/components/reasoning";
import { Button } from "@/components/ui/button";
import { CitationProvider } from "@/components/ui/citation-context";
import { SkeletonText } from "@/components/ui/skeleton-text";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import { useStreamOverlays } from "@/stores/stream-overlays";
import { useZenModeStore } from "@/stores/zen-mode-store";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { Spinner } from "../spinner";
import { AttachmentStrip } from "./AttachmentStrip";
import { ImageActions } from "./ImageActions";
import { ImageGenerationSkeleton } from "./ImageGenerationSkeleton";
import { ImageLoadingSkeleton } from "./ImageLoadingSkeleton";
import { ImageViewToggle } from "./ImageViewToggle";
import { MessageActions } from "./MessageActions";
import { MessageError } from "./MessageError";
import { useAssistantDisplayPhase } from "./useAssistantDisplayPhase";

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
  const skipInitialAnimationRef = useRef(true);
  const [isLoaded, setIsLoaded] = useState(true);
  const [displayUrl, setDisplayUrl] = useState<string | null>(
    storageId ? null : imageUrl
  );

  // Get Convex storage URL if we have a storageId
  const convexUrl = useQuery(
    api.fileStorage.getFileUrl,
    storageId ? { storageId } : "skip"
  );

  const actualImageUrl = storageId && convexUrl ? convexUrl : imageUrl;

  useEffect(() => {
    if (!storageId) {
      setDisplayUrl(imageUrl);
      setIsLoaded(skipInitialAnimationRef.current);
      return;
    }

    if (!actualImageUrl) {
      setDisplayUrl(null);
      setIsLoaded(false);
      return;
    }

    if (displayUrl === actualImageUrl) {
      return;
    }

    let cancelled = false;
    const preload = new Image();
    preload.src = actualImageUrl;

    const handleReady = () => {
      if (cancelled) {
        return;
      }

      setDisplayUrl(actualImageUrl);
      setIsLoaded(skipInitialAnimationRef.current);
    };

    preload.onload = handleReady;
    preload.onerror = handleReady;

    return () => {
      cancelled = true;
    };
  }, [actualImageUrl, displayUrl, imageUrl, storageId]);

  const aspectClass = getAspectRatioClass(aspectRatio || "1:1");
  const isSingleImage = className?.includes("single-image");
  const maxWidthClass = isSingleImage
    ? getSingleImageMaxWidth(aspectRatio || "1:1")
    : "";

  useEffect(() => {
    if (!skipInitialAnimationRef.current) {
      setIsLoaded(false);
    }
  }, []);

  const finalizeReveal = () => {
    const commit = () => {
      skipInitialAnimationRef.current = false;
      setIsLoaded(true);
    };

    if (skipInitialAnimationRef.current || typeof window === "undefined") {
      commit();
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(commit);
    });
  };

  const hasDisplayUrl = Boolean(displayUrl);
  const showSkeleton = !(hasDisplayUrl && isLoaded);
  const showImage = hasDisplayUrl && !showSkeleton;

  return (
    <div
      className={cn("relative w-full", aspectClass, maxWidthClass, className)}
    >
      <ImageLoadingSkeleton
        aspectRatio={aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4"}
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-400 ease-out",
          showSkeleton ? "opacity-100" : "opacity-0"
        )}
      />

      {hasDisplayUrl && (
        <button
          type="button"
          className={cn(
            "absolute inset-0 rounded-lg hover:shadow-lg transition-all duration-400 ease-out focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden cursor-zoom-in",
            showImage
              ? "opacity-100 translate-y-0 scale-100"
              : "pointer-events-none opacity-0 translate-y-1 scale-[0.985]"
          )}
          onClick={() => {
            if (displayUrl) {
              onClick(displayUrl);
            }
          }}
          aria-label="Click to view full size image"
        >
          <img
            src={displayUrl ?? undefined}
            alt={altText}
            className="h-full w-full object-cover rounded-lg shadow-lg"
            onLoad={finalizeReveal}
            onError={finalizeReveal}
            loading="lazy"
            decoding="async"
          />
        </button>
      )}
    </div>
  );
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
  // Use global conversation-level preview via onPreviewFile passed from parent
  const [showReasoning, setShowReasoning] = useState(false);
  const [citationsExpanded, setCitationsExpanded] = useState(false);
  const overlayTools = useStreamOverlays(
    useShallow(s => s.tools[message.id] || [])
  );
  const conversationTitle = useQuery(
    api.conversations.getWithAccessInfo,
    conversationId ? { id: conversationId as Id<"conversations"> } : "skip"
  )?.conversation?.title;
  const openZenOverlay = useZenModeStore(s => s.open);

  // Memoized image lists derived from message
  const generatedImageAttachments = useMemo(() => {
    const atts =
      message.attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) || [];
    // Deduplicate by URL to avoid showing duplicate generations
    const seen = new Set<string>();
    const unique = [] as typeof atts;
    for (const att of atts) {
      const url = att.url;
      if (!url || seen.has(url)) {
        continue;
      }
      seen.add(url);
      unique.push(att);
    }
    return unique;
  }, [message.attachments]);

  const outputUrls = useMemo(() => {
    const urls = message.imageGeneration?.output || [];
    // Deduplicate URLs to handle provider responses with repeated entries
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const u of urls) {
      if (!u || seen.has(u)) {
        continue;
      }
      seen.add(u);
      unique.push(u);
    }
    return unique;
  }, [message.imageGeneration]);

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

  // Helper: given a URL, find the corresponding attachment object
  const findAttachmentByUrl = useCallback(
    (url: string) => {
      const att = imageAttachments.find(a => a.url === url);
      if (att) {
        return att;
      }
      // Fallback minimal attachment if not found (should be rare)
      return {
        type: "image" as const,
        name: url.split("/").pop() || "Image",
        url,
        size: 0,
      } satisfies Attachment;
    },
    [imageAttachments]
  );

  const reasoning = message.reasoning;
  const displayContent = message.content;
  const hasTextContent = Boolean(
    displayContent && displayContent.trim().length > 0
  );
  const isImageGeneration = Boolean(message.imageGeneration);
  const hasReasoningText = Boolean(reasoning && reasoning.trim().length > 0);
  const isZenModeAvailable = !isImageGeneration && hasTextContent;
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
  const showPreContentStrip =
    !isImageGeneration && phase === "precontent" && !!statusLabel;
  const showSkeleton =
    !isImageGeneration && phase === "precontent" && !hasReasoningText;
  const showStreamingContent =
    !isImageGeneration && (phase === "streaming" || phase === "complete");

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

  // Get the model name for display - memoized to avoid recalculations
  const getModelDisplayName = useCallback(
    (modelId: string | undefined): string => {
      if (!modelId) {
        return "replicate";
      }
      return MODEL_DISPLAY_NAMES[modelId] || modelId;
    },
    []
  );

  const renderToolActivitySummary = useCallback(
    (
      overlayTools: Array<{
        t: string;
        name: string;
        args?: unknown;
        ok?: boolean;
        count?: number;
      }>
    ): ReactNode => {
      const last = overlayTools[overlayTools.length - 1];
      if (!last) {
        return null;
      }
      if (last.t === "tool_call") {
        if (last.name === "exa.search") {
          const args = last.args as
            | { query?: string; searchType?: string; searchMode?: string }
            | undefined;
          const searchType = args?.searchType || "search";
          const searchMode = args?.searchMode;

          if (searchType === "answer") {
            return <span>Looking for a direct answer…</span>;
          }
          if (searchType === "similar") {
            return <span>Discovering similar pages…</span>;
          }
          if (searchMode === "deep") {
            return <span>Performing deep research search…</span>;
          }
          return <span>Searching the web for relevant information…</span>;
        }
        return <span>Calling {last.name}…</span>;
      }
      if (last.name === "exa.search") {
        const previousCall = overlayTools.find(
          tool => tool.t === "tool_call" && tool.name === "exa.search"
        );
        const args = previousCall?.args as
          | { query?: string; searchType?: string; searchMode?: string }
          | undefined;
        const searchType = args?.searchType || "search";
        const count = typeof last.count === "number" ? last.count : 0;

        if (last.ok === false) {
          return <span>Search failed</span>;
        }

        if (searchType === "answer") {
          return (
            <span>
              Found answer
              {count > 0 ? ` (${count} source${count !== 1 ? "s" : ""})` : ""}
            </span>
          );
        }
        if (searchType === "similar") {
          return (
            <span>
              Found {count} similar {count === 1 ? "page" : "pages"}
            </span>
          );
        }
        return (
          <span>
            Found {count} {count === 1 ? "source" : "sources"}
          </span>
        );
      }
      return (
        <span>
          {last.ok === false ? "Failed" : "Finished"} {last.name}
          {typeof last.count === "number" ? ` (${last.count} results)` : null}
        </span>
      );
    },
    []
  );

  const renderImageGenerationLoadingSkeleton = useCallback(
    (
      count: number,
      aspectRatio: string | undefined,
      messageId: string
    ): ReactNode => {
      if (count === 1) {
        const maxWidthClass = getSingleImageMaxWidth(aspectRatio || "1:1");
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
            count === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            count >= 4 && "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {Array.from({ length: count }).map((_, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton placeholders don't have unique IDs
              key={`skeleton-${messageId}-${index}`}
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
    },
    []
  );

  const renderImageGrid = useCallback(
    (
      hasStoredImages: boolean,
      generatedImageAttachments: Attachment[],
      outputUrls: string[],
      messageId: string,
      aspectRatio: string | undefined,
      findAttachmentByUrl: (url: string) => Attachment,
      onPreviewFile?: (attachment: Attachment) => void
    ): ReactNode => {
      const items = hasStoredImages
        ? generatedImageAttachments
        : outputUrls.map(url => ({ url }));

      return (
        <div
          className={cn(
            "overflow-visible",
            items.length === 1
              ? "stack-md flex flex-col items-start"
              : "grid gap-6",
            items.length === 2 && "grid-cols-1 sm:grid-cols-2",
            items.length === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            items.length >= 4 && "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {items.map((item, index) => {
            const attachment = hasStoredImages ? (item as Attachment) : null;
            const url = hasStoredImages
              ? (item as Attachment).url
              : (item as { url: string }).url;

            return (
              <ImageContainer
                key={url || `${messageId}-img-${index}`}
                imageUrl={url}
                storageId={attachment?.storageId as Id<"_storage"> | undefined}
                altText={`Generated content ${index + 1}`}
                aspectRatio={aspectRatio}
                onClick={finalUrl => {
                  if (attachment) {
                    onPreviewFile?.(attachment);
                  } else {
                    onPreviewFile?.(findAttachmentByUrl(finalUrl));
                  }
                }}
                className={cn(items.length === 1 ? "single-image" : "w-full")}
              />
            );
          })}
        </div>
      );
    },
    []
  );

  const renderImageGenerationContent = useCallback(
    (
      imageGeneration: ChatMessageType["imageGeneration"],
      hasAnyGeneratedImages: boolean,
      hasStoredImages: boolean,
      generatedImageAttachments: Attachment[],
      outputUrls: string[],
      messageId: string,
      findAttachmentByUrl: (url: string) => Attachment,
      onPreviewFile?: (attachment: Attachment) => void,
      onRetryImageGeneration?: (messageId: string) => void,
      message?: ChatMessageType
    ): ReactNode => {
      if (!imageGeneration) {
        return null;
      }

      const isFailedOrCanceled =
        imageGeneration.status === "failed" ||
        imageGeneration.status === "canceled";
      const isSucceededWithImages =
        imageGeneration.status === "succeeded" && hasAnyGeneratedImages;

      if (isFailedOrCanceled && message) {
        return (
          <MessageError
            message={message}
            messageId={messageId}
            onRetry={onRetryImageGeneration}
          />
        );
      }

      if (isSucceededWithImages) {
        return (
          <ImageViewToggle
            images={
              hasStoredImages
                ? generatedImageAttachments.map(att => att.url)
                : outputUrls
            }
            aspectRatio={imageGeneration.metadata?.params?.aspectRatio}
            onImageClick={url => {
              const att = findAttachmentByUrl(url);
              onPreviewFile?.(att);
            }}
            messageId={messageId}
            className="image-gallery-wrapper"
            gridComponent={renderImageGrid(
              hasStoredImages,
              generatedImageAttachments,
              outputUrls,
              messageId,
              imageGeneration?.metadata?.params?.aspectRatio,
              findAttachmentByUrl,
              onPreviewFile
            )}
          />
        );
      }

      return renderImageGenerationLoadingSkeleton(
        imageGeneration.metadata?.params?.count || 1,
        imageGeneration.metadata?.params?.aspectRatio,
        messageId
      );
    },
    [renderImageGrid, renderImageGenerationLoadingSkeleton]
  );

  const hasGeneratedImages = useCallback(
    (
      attachments: Attachment[] | undefined,
      imageGeneration: ChatMessageType["imageGeneration"]
    ): boolean => {
      const generatedImages =
        attachments?.filter(
          att => att.type === "image" && att.generatedImage?.isGenerated
        ) || [];
      const outputUrls = imageGeneration?.output || [];
      return generatedImages.length > 0 || outputUrls.length > 0;
    },
    []
  );

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

            {/* Tool activity summary (non-intrusive, single line) */}
            {overlayTools.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {renderToolActivitySummary(overlayTools)}
              </div>
            )}
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

        {/* Handle image generation messages */}
        {message.imageGeneration ? (
          <div className="mb-3">
            {renderImageGenerationContent(
              message.imageGeneration,
              hasAnyGeneratedImages,
              hasStoredImages,
              generatedImageAttachments,
              outputUrls,
              message.id,
              findAttachmentByUrl,
              onPreviewFile,
              onRetryImageGeneration,
              message
            )}
          </div>
        ) : (
          /* Regular text message content with skeleton → content crossfade */
          <div className="relative">
            {/* Skeleton block to reserve space before first chunk */}
            {showSkeleton && (
              <SkeletonText lines={3} className="max-w-[74ch]" />
            )}

            {/* Crossfade to content when streaming starts or completes */}
            {showStreamingContent && (
              <div
                className={cn(
                  "transition-opacity duration-150",
                  showSkeleton ? "opacity-0" : "opacity-100"
                )}
              >
                <CitationProvider
                  citations={message.citations || []}
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

        {/* Defer citations until content has begun to reduce early reflow */}
        {message.citations &&
          message.citations.length > 0 &&
          (phase === "streaming" || phase === "complete") && (
            <CitationsGallery
              key={`citations-${message.id}-${phase}`}
              citations={message.citations}
              messageId={message.id}
              content={message.content}
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

        {/* Show image-specific actions for image generation messages */}
        {message.imageGeneration &&
        message.imageGeneration.status === "succeeded" &&
        hasGeneratedImages(message.attachments, message.imageGeneration) ? (
          <div
            className={cn(
              "flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 ease-out",
              showActions && "sm:opacity-100"
            )}
          >
            <div className="flex items-center gap-1">
              {/* Image Actions */}
              <ImageActions
                imageUrl={message.imageGeneration?.output?.[0] || ""}
                prompt={message.imageGeneration?.metadata?.prompt}
                seed={generatedImageAttachments[0]?.generatedImage?.seed}
                onRetry={
                  onRetryImageGeneration
                    ? () => onRetryImageGeneration(message.id)
                    : undefined
                }
                className="gap-0"
              />

              {/* Delete message */}
              {onDeleteMessage && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onDeleteMessage}
                      disabled={isDeleting}
                      className="btn-action-destructive h-7 w-7 p-0"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete message</TooltipContent>
                </Tooltip>
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
          /* Regular message actions for text messages; keep a reserved row to avoid shifts */
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
                onToggleCitations={() =>
                  setCitationsExpanded(!citationsExpanded)
                }
              />
            </div>
          </div>
        )}

        {/* Image preview dialog */}
        {/* Image preview is handled by conversation-level gallery */}
      </div>
    </div>
  );
};
