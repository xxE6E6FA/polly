import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { ImageActions } from "./image-actions";
import { ImageGenerationSkeleton } from "./image-generation-skeleton";
import { ImageLoadingSkeleton } from "./image-loading-skeleton";
import { ImageViewToggle } from "./image-view-toggle";
import { MessageError } from "./message-error";

type ImageGenerationBubbleProps = {
  conversationId?: string;
  message: ChatMessageType;
  isStreaming?: boolean;
  isDeleting: boolean;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
  onRetryImageGeneration?: (messageId: string) => void;
};

// Popular model names for better display
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "black-forest-labs/flux-dev": "FLUX Dev",
  "black-forest-labs/flux-pro": "FLUX Pro",
  "black-forest-labs/flux-schnell": "FLUX Schnell",
  "black-forest-labs/flux-1.1-pro": "FLUX 1.1 Pro",
  "black-forest-labs/flux-1.1-pro-ultra": "FLUX 1.1 Pro Ultra",
  "black-forest-labs/flux-fill-dev": "FLUX Fill Dev",
  "black-forest-labs/flux-fill-pro": "FLUX Fill Pro",
  "black-forest-labs/flux-depth-dev": "FLUX Depth Dev",
  "black-forest-labs/flux-depth-pro": "FLUX Depth Pro",
  "black-forest-labs/flux-canny-dev": "FLUX Canny Dev",
  "black-forest-labs/flux-canny-pro": "FLUX Canny Pro",
  "black-forest-labs/flux-redux-dev": "FLUX Redux Dev",
  "black-forest-labs/flux-kontext-pro": "FLUX Kontext Pro",
  "black-forest-labs/flux-kontext-max": "FLUX Kontext Max",
  "stability-ai/sdxl": "SDXL",
  "stability-ai/stable-diffusion-3": "Stable Diffusion 3",
  "stability-ai/stable-diffusion-3.5-large": "SD 3.5 Large",
  "stability-ai/stable-diffusion-3.5-large-turbo": "SD 3.5 Large Turbo",
  "stability-ai/stable-diffusion-3.5-medium": "SD 3.5 Medium",
  "playground-v2.5": "Playground v2.5",
  "ideogram-ai/ideogram-v2": "Ideogram V2",
  "ideogram-ai/ideogram-v2-turbo": "Ideogram V2 Turbo",
  "recraft-ai/recraft-v3": "Recraft V3",
  "recraft-ai/recraft-v3-svg": "Recraft V3 SVG",
  "google/imagen-3": "Imagen 3",
  "google/imagen-3-fast": "Imagen 3 Fast",
};

/**
 * Generates a display name from a model ID when not in the known mapping.
 * e.g., "owner/my-model-name" -> "My Model Name"
 */
function formatModelDisplayName(modelId: string): string {
  const parts = modelId.split("/");
  const modelName = parts[parts.length - 1] || modelId;
  return modelName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bSdxl\b/gi, "SDXL")
    .replace(/\bSd\b/g, "SD")
    .replace(/\bFlux\b/gi, "FLUX")
    .replace(/\bV(\d)/gi, "V$1")
    .trim();
}

function getModelDisplayName(modelId: string | undefined): string {
  if (!modelId) {
    return "Image Generation";
  }
  if (MODEL_DISPLAY_NAMES[modelId]) {
    return MODEL_DISPLAY_NAMES[modelId];
  }
  return formatModelDisplayName(modelId);
}

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

export const ImageGenerationBubble = ({
  message,
  isStreaming = false,
  isDeleting,
  onDeleteMessage,
  onPreviewFile,
  onRetryImageGeneration,
}: ImageGenerationBubbleProps) => {
  const imageGeneration = message.imageGeneration;

  // Linger state to keep actions briefly visible after mouseout
  const {
    isVisible: showActions,
    onMouseEnter,
    onMouseLeave,
  } = useHoverLinger({ delay: 700 });

  // Memoized image lists derived from message
  const generatedImageAttachments = useMemo(() => {
    const atts =
      message.attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) || [];
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
    const urls = imageGeneration?.output || [];
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
  }, [imageGeneration]);

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
            model: imageGeneration?.metadata?.model,
            prompt: imageGeneration?.metadata?.prompt,
          },
        }) satisfies Attachment
    );
  }, [hasStoredImages, generatedImageAttachments, outputUrls, imageGeneration]);

  const findAttachmentByUrl = useCallback(
    (url: string) => {
      const att = imageAttachments.find(a => a.url === url);
      if (att) {
        return att;
      }
      return {
        type: "image" as const,
        name: url.split("/").pop() || "Image",
        url,
        size: 0,
      } satisfies Attachment;
    },
    [imageAttachments]
  );

  // Determine status
  const status = imageGeneration?.status;
  const isFailed = status === "failed";
  const isCanceled = status === "canceled";
  const isSucceeded = status === "succeeded";
  const isInProgress = status === "starting" || status === "processing";

  const renderLoadingSkeleton = useCallback(
    (
      count: number,
      aspectRatio: string | undefined,
      interrupted = false
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
                interrupted={interrupted}
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
                interrupted={interrupted}
              />
            </div>
          ))}
        </div>
      );
    },
    [message.id]
  );

  const renderImageGrid = useCallback((): ReactNode => {
    const items = hasStoredImages
      ? generatedImageAttachments
      : outputUrls.map(url => ({ url }));
    const aspectRatio = imageGeneration?.metadata?.params?.aspectRatio;

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
              key={url || `${message.id}-img-${index}`}
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
  }, [
    hasStoredImages,
    generatedImageAttachments,
    outputUrls,
    imageGeneration,
    message.id,
    onPreviewFile,
    findAttachmentByUrl,
  ]);

  // Render content based on status
  const renderContent = () => {
    if (!imageGeneration) {
      return null;
    }

    const aspectRatio = imageGeneration.metadata?.params?.aspectRatio;
    const count = imageGeneration.metadata?.params?.count || 1;

    // Failed: show error with retry
    if (isFailed) {
      return (
        <MessageError
          message={message}
          messageId={message.id}
          onRetry={onRetryImageGeneration}
        />
      );
    }

    // Canceled: show interrupted skeleton
    if (isCanceled) {
      return renderLoadingSkeleton(count, aspectRatio, true);
    }

    // Succeeded with images: show the images
    if (isSucceeded && hasAnyGeneratedImages) {
      return (
        <ImageViewToggle
          images={
            hasStoredImages
              ? generatedImageAttachments.map(att => att.url)
              : outputUrls
          }
          aspectRatio={aspectRatio}
          onImageClick={url => {
            const att = findAttachmentByUrl(url);
            onPreviewFile?.(att);
          }}
          messageId={message.id}
          className="image-gallery-wrapper"
          gridComponent={renderImageGrid()}
        />
      );
    }

    // In progress: show loading skeleton
    return renderLoadingSkeleton(count, aspectRatio);
  };

  // Render actions based on status
  const renderActions = () => {
    // No actions during in-progress/streaming
    if (isInProgress || isStreaming) {
      return null;
    }

    // Failed state: no separate actions (retry is in MessageError)
    if (isFailed) {
      return null;
    }

    const modelName = getModelDisplayName(
      imageGeneration?.metadata?.model || message.model
    );

    // Canceled: show minimal actions (retry + copy prompt)
    if (isCanceled) {
      return (
        <div
          className={cn(
            "flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 ease-out",
            showActions && "sm:opacity-100"
          )}
        >
          <div className="flex items-center gap-1">
            <ImageActions
              imageUrl=""
              prompt={imageGeneration?.metadata?.prompt}
              onRetry={
                onRetryImageGeneration
                  ? () => onRetryImageGeneration(message.id)
                  : undefined
              }
              minimal
              className="gap-0"
            />

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

          <span className="text-xs text-muted-foreground/70">{modelName}</span>
        </div>
      );
    }

    // Succeeded: show full actions
    if (isSucceeded && hasAnyGeneratedImages) {
      return (
        <div
          className={cn(
            "flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 ease-out",
            showActions && "sm:opacity-100"
          )}
        >
          <div className="flex items-center gap-1">
            <ImageActions
              imageUrl={imageGeneration?.output?.[0] || ""}
              prompt={imageGeneration?.metadata?.prompt}
              seed={imageGeneration?.metadata?.params?.seed}
              onRetry={
                onRetryImageGeneration
                  ? () => onRetryImageGeneration(message.id)
                  : undefined
              }
              className="gap-0"
            />

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

          <span className="text-xs text-muted-foreground/70">{modelName}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full">
      <div
        className="min-w-0 flex-1"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Image generation content */}
        <div className="mb-3">{renderContent()}</div>

        {/* Actions */}
        {renderActions()}
      </div>
    </div>
  );
};
