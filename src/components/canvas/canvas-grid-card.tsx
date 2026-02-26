import { api } from "@convex/_generated/api";
import {
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
import {
  type ImageRetryParams,
  ImageRetryPopover,
} from "@/components/chat/message/image-retry-popover";
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
import { type CanvasImage, isUpscaleInProgress } from "@/types";

type CanvasGridCardProps = {
  image: CanvasImage;
  editChildren?: CanvasImage[];
  onClick?: (target?: CanvasImage) => void;
  onRequestDelete?: (image: CanvasImage) => void;
};

export function CanvasGridCard({
  image,
  editChildren,
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
      editChildren={editChildren}
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

  const handleRetryWithParams = async (params: ImageRetryParams) => {
    if (!image.generationId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryGeneration({
        id: image.generationId,
        model: params.model,
      });
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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <span className="text-xs font-medium text-destructive">
          {image.status === "canceled" ? "Canceled" : "Failed"}
        </span>
        {image.model && (
          <span className="text-xs text-muted-foreground">
            {formatModelName(image.model)}
          </span>
        )}
        {image.error && (
          <p className="line-clamp-2 text-center text-[10px] text-destructive/70">
            {image.error}
          </p>
        )}
        {image.generationId && (
          <div className="flex items-center gap-0.5 rounded-lg bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ArrowClockwiseIcon className="size-3.5" />
              Retry
            </button>
            <div className="h-4 w-px bg-border/50" />
            <ImageRetryPopover
              currentModel={image.model}
              currentAspectRatio={image.aspectRatio || "1:1"}
              onRetry={handleRetryWithParams}
              hideAspectRatio
              autoRetryOnSelect
              trigger={<CaretDownIcon className="size-3" />}
              className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            />
            <div className="h-4 w-px bg-border/50" />
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Delete generation"
                  className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <TrashIcon className="size-3.5" />
                </button>
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
  editChildren,
  onClick,
  onRequestDelete,
}: {
  image: CanvasImage;
  editChildren?: CanvasImage[];
  onClick?: (target?: CanvasImage) => void;
  onRequestDelete?: (image: CanvasImage) => void;
}) {
  const selectedImageIds = useCanvasStore(s => s.selectedImageIds);
  const toggleImageSelection = useCanvasStore(s => s.toggleImageSelection);
  const loadImageSettings = useCanvasStore(s => s.loadImageSettings);
  const isSelected = selectedImageIds.has(image.id);
  const isSelecting = selectedImageIds.size > 0;
  const managedToast = useToast();

  const inProgressUpscale = image.upscales.find(isUpscaleInProgress);
  const isUpscaling = !!inProgressUpscale;

  // Filmstrip hover state — null means show original
  const [hoveredEditIndex, setHoveredEditIndex] = useState<number | null>(null);
  const edits = editChildren ?? [];
  const hasEdits = edits.length > 0 && !image.parentGenerationId;

  // Show latest succeeded upscale, or original
  const latestSucceeded = image.upscales.findLast(
    u => u.status === "succeeded" && u.imageUrl
  );
  const originalUrl = latestSucceeded?.imageUrl ?? image.imageUrl;

  // If hovering a filmstrip thumbnail, swap the displayed image
  const hoveredEdit =
    hoveredEditIndex !== null ? edits[hoveredEditIndex] : null;
  const displayUrl = hoveredEdit?.imageUrl ?? originalUrl;

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

  const handleUseSettings = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      loadImageSettings(image);
      managedToast.success("Settings loaded into form");
    },
    [image, loadImageSettings, managedToast]
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
      className={`group relative overflow-hidden rounded-lg border bg-muted/30 transition-[border-color,box-shadow] duration-200 hover:shadow-md ${
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
        src={displayUrl}
        alt={image.prompt || "Generated image"}
        className="block w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        loading="lazy"
      />

      {/* Upscaling overlay */}
      {isUpscaling && <UpscalingOverlay image={image} />}

      {/* Selection checkbox — fades in/out */}
      <button
        type="button"
        className={`absolute left-1.5 top-1.5 z-10 flex items-center justify-center rounded-full transition-opacity duration-200 hover:scale-110 ${
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
            className="size-5 text-primary drop-shadow-md"
          />
        ) : (
          <CircleIcon
            weight="regular"
            className="size-5 text-white/80 drop-shadow-md"
          />
        )}
      </button>

      {/* Action buttons — fade in on hover, hidden during multi-select */}
      <div
        className={`absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 transition-opacity duration-200 ${
          isSelecting
            ? "pointer-events-none opacity-0"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={handleCopyImage}
              aria-label="Copy image"
            >
              <CopyIcon animateOnHover size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy image</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={handleDownload}
              aria-label="Download image"
            >
              <DownloadIcon animateOnHover size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Download image</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={handleUseSettings}
              aria-label="Use settings"
            >
              <ArrowsClockwiseIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Use settings</TooltipContent>
        </Tooltip>
        {image.source === "canvas" && image.generationId && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-red-600/70"
                onClick={handleDelete}
                aria-label="Delete image"
              >
                <TrashIcon animateOnHover size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete image</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Info overlay — fades in at bottom on hover, hidden during multi-select */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2.5 pt-10 transition-opacity duration-200 ${
          isSelecting ? "opacity-0" : "opacity-0 group-hover:opacity-100"
        } ${hasEdits ? "pb-12" : ""}`}
      >
        {image.prompt && (
          <p className="line-clamp-2 text-[11px] leading-snug text-white drop-shadow-sm">
            {image.prompt}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/80">
          {image.upscales
            .filter(u => u.status === "succeeded" && u.imageUrl)
            .map(u => (
              <span
                key={u.id}
                className="rounded bg-white/25 px-1.5 py-0.5 font-medium backdrop-blur-sm"
              >
                {u.type === "standard" ? "2x" : "2x+"}
              </span>
            ))}
          {image.parentGenerationId && (
            <span className="inline-flex items-center gap-1 rounded bg-white/25 px-1.5 py-0.5 font-medium backdrop-blur-sm">
              <PencilSimpleIcon className="size-2.5" />
              edit
            </span>
          )}
          {image.model && <span>{formatModelName(image.model)}</span>}
        </div>
      </div>

      {/* Filmstrip — hover to scrub through edit versions */}
      {hasEdits && !isSelecting && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          onMouseLeave={() => setHoveredEditIndex(null)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <div className="flex gap-1 overflow-x-auto rounded-md bg-black/40 p-1 backdrop-blur-sm">
            {/* Original thumbnail */}
            <button
              type="button"
              className={`relative size-8 shrink-0 overflow-hidden rounded-sm ring-1.5 transition-all ${
                hoveredEditIndex === null
                  ? "ring-white shadow-sm"
                  : "ring-white/30 hover:ring-white/60"
              }`}
              onMouseEnter={() => setHoveredEditIndex(null)}
              onClick={() => onClick?.()}
            >
              <img
                src={originalUrl}
                alt="Original"
                className="size-full object-cover"
              />
            </button>
            {/* Edit thumbnails */}
            {edits.map((edit, idx) => (
              <button
                key={edit.id}
                type="button"
                className={`relative size-8 shrink-0 overflow-hidden rounded-sm ring-1.5 transition-all ${
                  hoveredEditIndex === idx
                    ? "ring-white shadow-sm"
                    : "ring-white/30 hover:ring-white/60"
                }`}
                onMouseEnter={() => setHoveredEditIndex(idx)}
                onClick={() => onClick?.(edit)}
              >
                <img
                  src={edit.imageUrl}
                  alt={`Edit ${idx + 1}`}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UpscalingOverlay({ image }: { image: CanvasImage }) {
  const removeUpscaleEntry = useMutation(api.generations.removeUpscaleEntry);
  const [isCanceling, setIsCanceling] = useState(false);

  const inProgressEntry = image.upscales.find(isUpscaleInProgress);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(image.generationId && inProgressEntry) || isCanceling) {
      return;
    }
    setIsCanceling(true);
    try {
      await removeUpscaleEntry({
        id: image.generationId,
        upscaleId: inProgressEntry.id,
      });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="absolute inset-0 animate-in fade-in-0 duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/20 animate-pulse" />
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-2.5">
        <div className="relative">
          <div className="absolute -inset-2 animate-ping rounded-full bg-primary/20" />
          <div className="relative rounded-full bg-white/15 p-3 ring-1 ring-white/25 backdrop-blur-md">
            <ArrowsOutIcon className="size-5 text-white" />
          </div>
        </div>
        <span className="text-xs font-medium text-white drop-shadow-sm">
          Upscaling
        </span>
        {image.generationId && (
          <button
            type="button"
            className="mt-0.5 rounded-md bg-white/15 px-2.5 py-1 text-[10px] font-medium text-white/90 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/25 disabled:opacity-50"
            onClick={handleCancel}
            disabled={isCanceling}
          >
            {isCanceling ? "Canceling..." : "Cancel"}
          </button>
        )}
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
