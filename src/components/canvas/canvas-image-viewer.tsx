import { Dialog } from "@base-ui/react/dialog";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { CanvasImage } from "@/types";

type CanvasImageViewerProps = {
  images: CanvasImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
};

export function CanvasImageViewer({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: CanvasImageViewerProps) {
  const image = images[currentIndex];

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

  if (!image) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Backdrop
          className="fixed inset-0 z-modal bg-background/95 backdrop-blur-lg
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     data-[open]:animate-in data-[closed]:animate-out
                     data-[closed]:fade-out-0 data-[open]:fade-in-0
                     [animation-duration:200ms]"
        />

        {/* Full-screen popup container */}
        <Dialog.Popup
          className="fixed inset-0 z-modal flex items-center justify-center focus:outline-none"
          aria-label={`Image viewer: ${image.prompt || "Generated image"}`}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="lg"
            onClick={e => {
              e.stopPropagation();
              onOpenChange(false);
            }}
            className="absolute right-4 top-4 z-20 h-10 w-10 rounded-full bg-card/90 text-foreground shadow-lg dark:ring-1 dark:ring-white/[0.06] backdrop-blur-md hover:bg-card transition-colors duration-200"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </Button>

          {/* Navigation buttons */}
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

          {/* Counter pill */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium tabular-nums text-muted-foreground shadow-lg backdrop-blur-md dark:ring-1 dark:ring-white/[0.06]">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Image + clickable backdrop area */}
          <div
            className="flex h-full w-full items-center justify-center p-8"
            onClick={() => onOpenChange(false)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenChange(false);
              }
            }}
          >
            <div className="flex h-full w-full max-w-7xl flex-col items-center justify-center gap-4 pointer-events-none transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95">
              {/* Image */}
              <img
                key={image.id}
                src={image.imageUrl}
                alt={image.prompt || "Generated image"}
                className="max-h-[calc(100%-4rem)] max-w-full object-contain pointer-events-auto rounded-lg drop-shadow-2xl"
                draggable={false}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
                tabIndex={-1}
              />

              {/* Info bar */}
              <div className="pointer-events-auto flex max-w-2xl items-center gap-3 rounded-full bg-card/90 px-4 py-2 shadow-lg backdrop-blur-md dark:ring-1 dark:ring-white/[0.06]">
                {image.prompt && (
                  <p className="line-clamp-1 text-xs text-foreground/80">
                    {image.prompt}
                  </p>
                )}
                <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                  {image.model && <span>{formatModelName(image.model)}</span>}
                  {image.seed !== undefined && <span>Seed: {image.seed}</span>}
                  {image.duration !== undefined && (
                    <span>{image.duration.toFixed(1)}s</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatModelName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}
