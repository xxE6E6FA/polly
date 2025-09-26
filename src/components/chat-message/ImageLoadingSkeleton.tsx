import { memo } from "react";
import { cn } from "@/lib/utils";

interface ImageLoadingSkeletonProps {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  className?: string;
}

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

export const ImageLoadingSkeleton = memo<ImageLoadingSkeletonProps>(
  ({ aspectRatio = "1:1", className = "" }) => {
    const aspectClass = getAspectRatioClass(aspectRatio);

    return (
      <div
        className={cn(
          aspectClass,
          "relative skeleton-surface rounded-lg",
          className
        )}
      />
    );
  }
);

ImageLoadingSkeleton.displayName = "ImageLoadingSkeleton";
