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

// Card offset and rotation configurations for stacking effect
const getCardStyles = (index: number, total: number) => {
  // Cards further back have more offset and rotation
  const reverseIndex = total - 1 - index;
  const offsetX = reverseIndex * 8;
  const offsetY = reverseIndex * -6;
  const rotation = reverseIndex * 3;

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
        {/* Stack container with padding for card overflow */}
        <div className={cn("relative w-full", maxWidthClass)}>
          {/* Extra padding to account for card offsets */}
          <div className="relative pt-6 pl-6">
            {/* Background cards (stacked behind) */}
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
                    // Position offset for stacking effect
                    ...(!isTopCard && {
                      left: -offsetX,
                      top: -offsetY,
                    }),
                  }}
                >
                  {/* Wrapper for animation (animates without affecting position) */}
                  <div
                    className={cn(
                      !(isTopCard || interrupted) && "animate-card-stack-float"
                    )}
                    style={{
                      animationDelay: `${index * 200}ms`,
                      // Apply rotation here so animation only affects Y
                      transform: isTopCard
                        ? undefined
                        : `rotate(${rotation}deg)`,
                    }}
                  >
                    <div
                      className={cn(
                        aspectClass,
                        "rounded-lg shadow-md",
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
              className={cn(
                "absolute inset-0 flex items-center justify-center",
                "pointer-events-none"
              )}
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
      </div>
    );
  }
);

ImageCardStack.displayName = "ImageCardStack";
