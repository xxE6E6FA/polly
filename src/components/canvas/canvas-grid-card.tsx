import { api } from "@convex/_generated/api";
import {
  ArrowsClockwiseIcon,
  ArrowsOutIcon,
  CheckCircleIcon,
  CircleIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { memo, useCallback, useState } from "react";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
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
import { FailedGenerationCard } from "./failed-generation-card";

type CanvasGridCardProps = {
  image: CanvasImage;
  editChildren?: CanvasImage[];
  onClick?: (target?: CanvasImage) => void;
  onRequestDelete?: (image: CanvasImage) => void;
};

function CanvasGridCardInner({
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

export const CanvasGridCard = memo(CanvasGridCardInner, (prev, next) => {
  const a = prev.image;
  const b = next.image;
  if (a.id !== b.id || a.status !== b.status || a.imageUrl !== b.imageUrl) {
    return false;
  }
  if (a.editCount !== b.editCount) {
    return false;
  }
  // Compare upscale statuses (they can transition from processing → succeeded)
  if (a.upscales.length !== b.upscales.length) {
    return false;
  }
  for (let i = 0; i < a.upscales.length; i++) {
    if (a.upscales[i]?.status !== b.upscales[i]?.status) {
      return false;
    }
  }
  // Compare edit children by count and identity
  const ac = prev.editChildren;
  const bc = next.editChildren;
  if (ac?.length !== bc?.length) {
    return false;
  }
  if (ac && bc) {
    for (let i = 0; i < ac.length; i++) {
      if (
        ac[i]?.id !== bc[i]?.id ||
        ac[i]?.status !== bc[i]?.status ||
        ac[i]?.imageUrl !== bc[i]?.imageUrl
      ) {
        return false;
      }
    }
  }
  return true;
});

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
      className="group relative overflow-hidden rounded-lg border border-border/40"
      style={{ aspectRatio: formatAspectRatio(image.aspectRatio) }}
    >
      <div className="absolute inset-0">
        <div className="size-full skeleton-surface rounded-lg" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <span className="text-xs font-medium text-muted-foreground">
          Generating image…
        </span>
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
  return (
    <FailedGenerationCard
      generationId={image.generationId}
      status={image.status}
      model={image.model}
      error={image.error}
      aspectRatio={image.aspectRatio}
      onDelete={onRequestDelete ? () => onRequestDelete(image) : undefined}
    />
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

  // Image load state — keeps skeleton visible until the image is decoded.
  // Use a ref callback to detect browser-cached images immediately,
  // avoiding a skeleton flash when the component re-mounts during pagination.
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRefCallback = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, []);

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
      style={
        imageLoaded
          ? undefined
          : { aspectRatio: formatAspectRatio(image.aspectRatio) }
      }
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
      {/* Skeleton — fades out when image loads */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ease-out ${
          imageLoaded ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="size-full skeleton-surface rounded-lg" />
      </div>
      <img
        ref={imgRefCallback}
        src={displayUrl}
        alt={image.prompt || "Generated image"}
        loading="lazy"
        decoding="async"
        className={`block w-full transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.03] ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setImageLoaded(true)}
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
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
            {/* Edit thumbnails */}
            {edits.map((edit, idx) => {
              const editPending =
                edit.status === "pending" ||
                edit.status === "starting" ||
                edit.status === "processing";
              return (
                <button
                  key={edit.id}
                  type="button"
                  className={`relative size-8 shrink-0 overflow-hidden rounded-sm ring-1.5 transition-all ${
                    hoveredEditIndex === idx
                      ? "ring-white shadow-sm"
                      : "ring-white/30 hover:ring-white/60"
                  }`}
                  onMouseEnter={() => {
                    if (!editPending) {
                      setHoveredEditIndex(idx);
                    }
                  }}
                  onClick={() => {
                    if (!editPending) {
                      onClick?.(edit);
                    }
                  }}
                >
                  {editPending ? (
                    <div className="flex size-full items-center justify-center bg-muted/30">
                      <Spinner className="size-3" />
                    </div>
                  ) : (
                    <img
                      src={edit.imageUrl}
                      alt={`Edit ${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  )}
                </button>
              );
            })}
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
