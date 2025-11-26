import { StopCircleIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface ImageCardStackProps {
  count: number;
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

// Get max width based on aspect ratio for proper sizing
const getStackMaxWidth = (aspectRatio: string) => {
  switch (aspectRatio) {
    case "1:1":
      return "max-w-[280px]";
    case "16:9":
      return "max-w-[340px]";
    case "9:16":
      return "max-w-[200px]";
    case "4:3":
      return "max-w-[320px]";
    case "3:4":
      return "max-w-[240px]";
    default:
      return "max-w-[280px]";
  }
};

// Static card positions for the stack (avoids array index keys)
const CARD_POSITIONS = ["bottom", "lower", "upper", "top"] as const;

// Card styles - background cards offset behind the top card
const getCardStyles = (index: number, total: number) => {
  const reverseIndex = total - 1 - index;
  // Offset right and down so cards peek from behind top card
  const offsetX = reverseIndex * 4;
  const offsetY = reverseIndex * 4;
  const rotation = reverseIndex * -2;

  return {
    offsetX,
    offsetY,
    rotation,
    zIndex: index,
    position: CARD_POSITIONS[index] || `card-${index}`,
  };
};

export const ImageCardStack = memo<ImageCardStackProps>(
  ({ count, aspectRatio = "1:1", className = "", interrupted = false }) => {
    const aspectClass = aspectRatioClasses[aspectRatio] || "aspect-square";
    const maxWidthClass = getStackMaxWidth(aspectRatio);

    // Limit visual cards to 4 for cleaner appearance
    const visualCardCount = Math.min(count, 4);

    return (
      <div className={cn("flex flex-col items-start", className)}>
        <div className={cn("relative w-full", maxWidthClass)}>
          {/* Cards stack - top card is last, rendered on top */}
          {Array.from({ length: visualCardCount }).map((_, index) => {
            const isTopCard = index === visualCardCount - 1;
            const { offsetX, offsetY, rotation, zIndex, position } =
              getCardStyles(index, visualCardCount);

            return (
              <div
                key={position}
                className={cn(isTopCard ? "relative" : "absolute inset-0")}
                style={{
                  zIndex,
                  transform: isTopCard
                    ? undefined
                    : `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
                }}
              >
                <div
                  className={cn(
                    !(isTopCard || interrupted) && "animate-card-stack-float"
                  )}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <div
                    className={cn(
                      aspectClass,
                      "rounded-lg",
                      isTopCard ? "shadow-md" : "shadow-sm",
                      interrupted
                        ? "bg-muted/50 border border-dashed border-muted-foreground/30"
                        : "skeleton-surface"
                    )}
                  />
                </div>
              </div>
            );
          })}

          {/* Center content on top card */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: visualCardCount + 1 }}
          >
            <div
              className={cn(
                "flex flex-col items-center gap-1.5",
                interrupted
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
              )}
            >
              {interrupted ? (
                <>
                  <StopCircleIcon className="h-5 w-5" />
                  <span className="text-xs font-medium">Stopped</span>
                </>
              ) : (
                <span className="text-xs font-medium">
                  Generating {count} images…
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ImageCardStack.displayName = "ImageCardStack";
