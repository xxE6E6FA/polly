import { GridFour, Slideshow } from "@phosphor-icons/react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./OverflowImageGallery.css";

const ImageGallery = lazy(() =>
  import("./image-gallery").then(m => ({ default: m.ImageGallery }))
);

interface ImageViewToggleProps {
  images: string[];
  aspectRatio?: string;
  onImageClick: (imageUrl: string) => void;
  messageId: string;
  className?: string;
  gridComponent: React.ReactNode;
}

export const ImageViewToggle: React.FC<ImageViewToggleProps> = ({
  images,
  aspectRatio,
  onImageClick,
  messageId,
  className,
  gridComponent,
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "gallery">("grid");

  if (images.length <= 1) {
    // For single image, just show the grid component without toggle
    return (
      <div className={cn("relative w-full", className)}>{gridComponent}</div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Toggle buttons positioned above the gallery */}
      <div className="flex justify-end mb-3">
        <div className="flex bg-black/60 rounded-lg p-1 gap-1 z-10">
          <Tooltip>
            <TooltipTrigger delayDuration={200}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 w-7 p-0 hover:bg-white/20 transition-all duration-300 ease-out",
                  viewMode === "grid"
                    ? "bg-white/30 scale-105"
                    : "bg-transparent scale-100"
                )}
                onClick={() => setViewMode("grid")}
              >
                <GridFour
                  size={14}
                  className={cn(
                    "text-white transition-all duration-300",
                    viewMode === "grid" ? "scale-110" : "scale-100"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger delayDuration={200}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 w-7 p-0 hover:bg-white/20 transition-all duration-300 ease-out",
                  viewMode === "gallery"
                    ? "bg-white/30 scale-105"
                    : "bg-transparent scale-100"
                )}
                onClick={() => setViewMode("gallery")}
              >
                <Slideshow
                  size={14}
                  className={cn(
                    "text-white transition-all duration-300",
                    viewMode === "gallery" ? "scale-110" : "scale-100"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gallery view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content based on view mode with smooth transitions */}
      <div className="relative">
        <div
          className={cn(
            "transition-all duration-500 ease-out",
            viewMode === "grid"
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 -translate-y-2 pointer-events-none absolute inset-0"
          )}
        >
          {gridComponent}
        </div>

        <div
          className={cn(
            "transition-all duration-500 ease-out",
            viewMode === "gallery"
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-2 pointer-events-none absolute inset-0"
          )}
        >
          <div className="gallery-overflow-wrapper">
            <div className="gallery-overflow-inner">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center min-h-[200px]">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                }
              >
                <ImageGallery
                  images={images}
                  aspectRatio={aspectRatio}
                  onImageClick={onImageClick}
                  messageId={messageId}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
