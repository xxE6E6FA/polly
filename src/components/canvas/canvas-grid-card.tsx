import { api } from "@convex/_generated/api";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  copyImageToClipboard,
  downloadFromUrl,
  generateImageFilename,
} from "@/lib/export";
import { useToast } from "@/providers/toast-context";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasImage } from "@/types";

type CanvasGridCardProps = {
  image: CanvasImage;
  onClick?: () => void;
  onRequestDelete?: (image: CanvasImage) => void;
};

export function CanvasGridCard({
  image,
  onClick,
  onRequestDelete,
}: CanvasGridCardProps) {
  // Pending/processing states
  if (
    image.status === "pending" ||
    image.status === "starting" ||
    image.status === "processing"
  ) {
    return <PendingCard image={image} />;
  }

  // Failed state
  if (image.status === "failed" || image.status === "canceled") {
    return <FailedCard image={image} onRequestDelete={onRequestDelete} />;
  }

  // Succeeded state
  return (
    <SucceededCard
      image={image}
      onClick={onClick}
      onRequestDelete={onRequestDelete}
    />
  );
}

function PendingCard({ image }: { image: CanvasImage }) {
  const cancelGeneration = useMutation(api.generations.cancelGeneration);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!image.generationId) {
      return;
    }
    setIsCanceling(true);
    try {
      await cancelGeneration({ id: image.generationId });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border/40 bg-muted/30"
      style={{ aspectRatio: formatAspectRatio(image.aspectRatio) }}
    >
      <div className="absolute inset-0 animate-pulse bg-muted/50" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <Spinner />
        <span className="text-xs font-medium text-muted-foreground">
          {formatModelName(image.model)}
        </span>
        {image.prompt && (
          <p className="line-clamp-2 text-center text-xs text-muted-foreground/70">
            {image.prompt}
          </p>
        )}
      </div>
      {image.generationId && (
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-black/40 text-white/80 opacity-0 backdrop-blur-sm transition-all hover:bg-black/60 group-hover:opacity-100 disabled:opacity-50"
              onClick={handleCancel}
              disabled={isCanceling}
              aria-label="Cancel generation"
            >
              <XIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Cancel</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function FailedCard({
  image,
  onRequestDelete,
}: {
  image: CanvasImage;
  onRequestDelete?: (image: CanvasImage) => void;
}) {
  const retryGeneration = useMutation(api.generations.retryGeneration);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!image.generationId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryGeneration({ id: image.generationId });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestDelete?.(image);
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5">
      <div style={{ aspectRatio: formatAspectRatio(image.aspectRatio) }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <span className="text-xs font-medium text-destructive">
          {image.status === "canceled" ? "Canceled" : "Failed"}
        </span>
        {image.model && (
          <span className="text-xs text-muted-foreground">
            {formatModelName(image.model)}
          </span>
        )}
        {image.generationId && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="gap-1.5"
            >
              <ArrowClockwiseIcon className="size-3.5" />
              Retry
            </Button>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleDelete}
                  aria-label="Delete generation"
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function SucceededCard({
  image,
  onClick,
  onRequestDelete,
}: {
  image: CanvasImage;
  onClick?: () => void;
  onRequestDelete?: (image: CanvasImage) => void;
}) {
  const selectedImageIds = useCanvasStore(s => s.selectedImageIds);
  const toggleImageSelection = useCanvasStore(s => s.toggleImageSelection);
  const isSelected = selectedImageIds.has(image.id);
  const isSelecting = selectedImageIds.size > 0;
  const managedToast = useToast();

  const handleCopyImage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await copyImageToClipboard(image.imageUrl);
        managedToast.success("Image copied to clipboard");
      } catch {
        managedToast.error("Failed to copy image");
      }
    },
    [image.imageUrl, managedToast]
  );

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const filename = generateImageFilename(image.imageUrl, image.prompt);
        await downloadFromUrl(image.imageUrl, filename);
        managedToast.success("Image downloaded");
      } catch {
        managedToast.error("Failed to download image");
      }
    },
    [image.imageUrl, image.prompt, managedToast]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRequestDelete?.(image);
    },
    [image, onRequestDelete]
  );

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleImageSelection(image.id);
    },
    [image.id, toggleImageSelection]
  );

  const handleClick = useCallback(() => {
    if (isSelecting) {
      toggleImageSelection(image.id);
    } else {
      onClick?.();
    }
  }, [isSelecting, toggleImageSelection, image.id, onClick]);

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-muted/30 transition-all duration-200 hover:shadow-md ${
        isSelecting ? "cursor-pointer" : "cursor-zoom-in"
      } ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border/40"}`}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <img
        src={image.imageUrl}
        alt={image.prompt || "Generated image"}
        className="block w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        loading="lazy"
      />

      {/* Selection checkbox — fades in/out */}
      <button
        type="button"
        className={`absolute left-2 top-2 z-10 flex items-center justify-center rounded-full transition-opacity duration-200 hover:scale-110 ${
          isSelected || isSelecting
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={handleSelect}
        aria-label={isSelected ? "Deselect image" : "Select image"}
      >
        {isSelected ? (
          <CheckCircleIcon
            weight="fill"
            className="size-6 text-primary drop-shadow-md"
          />
        ) : (
          <CircleIcon
            weight="regular"
            className="size-6 text-white/80 drop-shadow-md"
          />
        )}
      </button>

      {/* Action buttons — fade in on hover, hidden during multi-select */}
      <div
        className={`absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity duration-200 ${
          isSelecting
            ? "pointer-events-none opacity-0"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={handleCopyImage}
              aria-label="Copy image"
            >
              <CopyIcon animateOnHover size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy image</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={handleDownload}
              aria-label="Download image"
            >
              <DownloadIcon animateOnHover size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Download image</TooltipContent>
        </Tooltip>
        {image.source === "canvas" && image.generationId && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-red-600/70"
                onClick={handleDelete}
                aria-label="Delete image"
              >
                <TrashIcon animateOnHover size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete image</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Info overlay — fades in at bottom on hover, hidden during multi-select */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-12 transition-opacity duration-200 ${
          isSelecting ? "opacity-0" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {image.prompt && (
          <p className="line-clamp-3 text-xs text-white drop-shadow-sm">
            {image.prompt}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/80">
          {image.model && <span>{formatModelName(image.model)}</span>}
          {image.seed !== undefined && <span>Seed: {image.seed}</span>}
          {image.duration !== undefined && (
            <span>{image.duration.toFixed(1)}s</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Converts "16:9" → "16/9" for CSS aspect-ratio, defaults to "1/1". */
function formatAspectRatio(ratio?: string): string {
  if (!ratio) {
    return "1/1";
  }
  const [w, h] = ratio.split(":").map(Number);
  if (w && h) {
    return `${w}/${h}`;
  }
  return "1/1";
}

function formatModelName(model?: string): string {
  if (!model) {
    return "";
  }
  // "owner/name" → "name"
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}
