import {
  ArrowsClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
import { Button } from "@/components/ui/button";
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

type CanvasImageViewerProps = {
  images: CanvasImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  onRequestDelete?: (image: CanvasImage) => void;
};

export function CanvasImageViewer({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
  onRequestDelete,
}: CanvasImageViewerProps) {
  const image = images[currentIndex];
  const managedToast = useToast();
  const imageAreaRef = useRef<HTMLDivElement>(null);

  const goToPrevious = useCallback(() => {
    if (images.length === 0) {
      return;
    }
    onIndexChange(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
  }, [currentIndex, images.length, onIndexChange]);

  const goToNext = useCallback(() => {
    if (images.length === 0) {
      return;
    }
    onIndexChange(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, images.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          goToPrevious();
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          goToNext();
          break;
        }
        case "Escape": {
          event.preventDefault();
          onOpenChange(false);
          break;
        }
        case "Home": {
          event.preventDefault();
          onIndexChange(0);
          break;
        }
        case "End": {
          event.preventDefault();
          onIndexChange(images.length - 1);
          break;
        }
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    open,
    goToPrevious,
    goToNext,
    onOpenChange,
    onIndexChange,
    images.length,
  ]);

  // Focus the image area when viewer opens so keyboard nav works immediately
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        imageAreaRef.current?.focus();
      });
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleCopyImage = useCallback(async () => {
    if (!image) {
      return;
    }
    try {
      await copyImageToClipboard(image.imageUrl);
      managedToast.success("Image copied to clipboard");
    } catch {
      managedToast.error("Failed to copy image");
    }
  }, [image, managedToast]);

  const handleDownload = useCallback(async () => {
    if (!image) {
      return;
    }
    try {
      const filename = generateImageFilename(image.imageUrl, image.prompt);
      await downloadFromUrl(image.imageUrl, filename);
      managedToast.success("Image downloaded");
    } catch {
      managedToast.error("Failed to download image");
    }
  }, [image, managedToast]);

  const handleCopyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        managedToast.success(`${label} copied`);
      } catch {
        managedToast.error(`Failed to copy ${label.toLowerCase()}`);
      }
    },
    [managedToast]
  );

  const handleDelete = useCallback(() => {
    if (!image) {
      return;
    }
    onRequestDelete?.(image);
  }, [image, onRequestDelete]);

  const loadImageSettings = useCanvasStore(s => s.loadImageSettings);
  const handleUseSettings = useCallback(() => {
    if (!image) {
      return;
    }
    loadImageSettings(image);
    onOpenChange(false);
    managedToast.success("Settings loaded into form");
  }, [image, loadImageSettings, onOpenChange, managedToast]);

  if (!(open && image)) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-label={`Image viewer: ${image.prompt || "Generated image"}`}
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-modal bg-background/95 backdrop-blur-lg animate-in fade-in-0 [animation-duration:200ms]" />

      {/* Full-screen container */}
      <div className="fixed inset-0 z-modal flex">
        {/* Image area (left) — receives initial focus for keyboard nav */}
        <div
          ref={imageAreaRef}
          tabIndex={-1}
          className="relative flex flex-1 items-center justify-center outline-none"
          onClick={() => onOpenChange(false)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          {/* Navigation buttons — edges of image area */}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-card/90 text-foreground shadow-lg dark:ring-1 dark:ring-white/[0.06] backdrop-blur-md hover:bg-card transition-colors duration-200"
                aria-label="Previous image"
              >
                <CaretLeftIcon className="size-6" />
              </Button>

              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-card/90 text-foreground shadow-lg dark:ring-1 dark:ring-white/[0.06] backdrop-blur-md hover:bg-card transition-colors duration-200"
                aria-label="Next image"
              >
                <CaretRightIcon className="size-6" />
              </Button>
            </>
          )}

          {/* Counter pill — bottom of image area */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium tabular-nums text-muted-foreground shadow-lg backdrop-blur-md dark:ring-1 dark:ring-white/[0.06]">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Image */}
          <div className="flex h-full w-full items-center justify-center p-8 pointer-events-none transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95">
            <img
              key={image.id}
              src={image.imageUrl}
              alt={image.prompt || "Generated image"}
              className="max-h-full max-w-full object-contain pointer-events-auto rounded-lg drop-shadow-2xl"
              draggable={false}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              tabIndex={-1}
            />
          </div>
        </div>

        {/* Info panel (right) */}
        <div
          className="flex w-[380px] shrink-0 flex-col border-l border-border/50 bg-card/80 backdrop-blur-md animate-in slide-in-from-right-4 fade-in-0 duration-300"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {/* Panel header with actions */}
          <div className="flex items-start justify-between gap-3 border-b border-border/40 p-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {formatModelName(image.model)}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      onClick={handleDelete}
                      aria-label="Delete image"
                    >
                      <TrashIcon animateOnHover size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Delete image</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={handleUseSettings}
                    aria-label="Use settings"
                  >
                    <ArrowsClockwiseIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use settings</TooltipContent>
              </Tooltip>
              <div className="mx-1 h-4 w-px bg-border/60" />
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                  >
                    <XIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2 border-b border-border/40 px-5 py-4">
            {image.duration !== undefined && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                <ClockIcon className="size-3.5" />
                {image.duration.toFixed(1)}s
              </span>
            )}
            {image.aspectRatio && (
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {image.aspectRatio}
              </span>
            )}
            {image.quality !== undefined && (
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                Quality {image.quality}
              </span>
            )}
            {image.seed !== undefined && (
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted/80"
                    onClick={() => handleCopyText(String(image.seed), "Seed")}
                  >
                    Seed {image.seed}
                    <CopyIcon size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy seed</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Prompt */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {image.prompt && (
              <div className="stack-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Prompt
                  </h3>
                  <Tooltip>
                    <TooltipTrigger>
                      <button
                        type="button"
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() =>
                          handleCopyText(image.prompt ?? "", "Prompt")
                        }
                        aria-label="Copy prompt"
                      >
                        <CopyIcon animateOnHover size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy prompt</TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {image.prompt}
                </p>
              </div>
            )}
          </div>

          {/* Timestamp footer */}
          <div className="border-t border-border/40 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(image.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body
  );
}

function formatModelName(model?: string): string {
  if (!model) {
    return "Generated Image";
  }
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
