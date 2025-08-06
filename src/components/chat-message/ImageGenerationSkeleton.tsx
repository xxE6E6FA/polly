import { memo } from "react";

interface ImageGenerationSkeletonProps {
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

export const ImageGenerationSkeleton = memo<ImageGenerationSkeletonProps>(
  ({ aspectRatio = "1:1", className = "" }) => {
    const aspectClass = getAspectRatioClass(aspectRatio);

    return (
      <div
        className={`${aspectClass} bg-muted rounded-lg animate-pulse flex items-center justify-center ${className}`}
      >
        <div className="text-muted-foreground text-sm">Generating image...</div>
      </div>
    );
  }
);

ImageGenerationSkeleton.displayName = "ImageGenerationSkeleton";
