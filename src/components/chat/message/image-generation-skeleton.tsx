import { StopCircleIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface ImageGenerationSkeletonProps {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  className?: string;
  /** Whether the generation was interrupted/stopped */
  interrupted?: boolean;
}

const aspectRatioClasses: Record<string, string> = {
  "1:1": "aspect-square",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
};

export const ImageGenerationSkeleton = memo<ImageGenerationSkeletonProps>(
  ({ aspectRatio = "1:1", className = "", interrupted = false }) => {
    const aspectClass = aspectRatioClasses[aspectRatio] || "aspect-square";

    return (
      <div
        className={cn(
          aspectClass,
          "rounded-lg flex items-center justify-center",
          interrupted
            ? "bg-muted/50 border border-dashed border-muted-foreground/30"
            : "skeleton-surface",
          className
        )}
      >
        <div
          className={cn(
            "relative flex flex-col items-center gap-1.5",
            interrupted ? "text-muted-foreground/60" : "text-muted-foreground"
          )}
        >
          {interrupted ? (
            <>
              <StopCircleIcon className="size-5" />
              <span className="text-xs font-medium">Stopped</span>
            </>
          ) : (
            <span className="text-xs font-medium">Generating image…</span>
          )}
        </div>
      </div>
    );
  }
);

ImageGenerationSkeleton.displayName = "ImageGenerationSkeleton";
