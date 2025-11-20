import { memo } from "react";
import { cn } from "@/lib/utils";

interface ImageGenerationSkeletonProps {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  className?: string;
}

const aspectRatioClasses: Record<string, string> = {
  "1:1": "aspect-square",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
};

export const ImageGenerationSkeleton = memo<ImageGenerationSkeletonProps>(
  ({ aspectRatio = "1:1", className = "" }) => {
    const aspectClass = aspectRatioClasses[aspectRatio] || "aspect-square";

    return (
      <div
        className={cn(
          aspectClass,
          "skeleton-surface rounded-lg flex items-center justify-center",
          className
        )}
      >
        <div className="relative text-xs font-medium text-muted-foreground">
          Generating image…
        </div>
      </div>
    );
  }
);

ImageGenerationSkeleton.displayName = "ImageGenerationSkeleton";
