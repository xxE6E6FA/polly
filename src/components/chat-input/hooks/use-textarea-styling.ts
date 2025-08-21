import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface UseTextareaStylingOptions {
  disabled?: boolean;
  className?: string;
  isTransitioning?: boolean;
  firstLineIndentPx?: number;
}

export function useTextareaStyling({
  disabled = false,
  className,
  isTransitioning = false,
  firstLineIndentPx,
}: UseTextareaStylingOptions) {
  const textareaClassName = useMemo(
    () =>
      cn(
        // Core layout & appearance
        "w-full resize-none bg-transparent border-0 outline-none ring-0",
        "text-sm leading-relaxed",
        "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-1 sm:px-2",
        // Enhanced focus experience - subtle visual feedback
        "focus:bg-background/50 focus:backdrop-blur-sm transition-colors duration-200",
        // Performance optimizations
        "will-change-[height] contain-layout transform-gpu hide-scrollbar md:scrollbar-thin",
        // Browser performance hints
        "[content-visibility:auto] [contain-intrinsic-size:24px_100px]",
        // States
        disabled && "cursor-not-allowed opacity-50",
        className
      ),
    [disabled, className]
  );

  const textareaStyle = useMemo(
    () => ({
      // Force GPU acceleration and composition layer
      transform: "translate3d(0, 0, 0)",
      // Conditionally enable transitions - only for fullscreen changes, not during typing
      transition: isTransitioning
        ? "max-height 300ms ease-in-out, min-height 300ms ease-in-out"
        : "none",
      // Additional browser performance hints
      contentVisibility: "auto" as const,
      containIntrinsicSize: "24px 100px",
      textIndent: firstLineIndentPx ? `${firstLineIndentPx}px` : undefined,
    }),
    [isTransitioning, firstLineIndentPx]
  );

  return {
    textareaClassName,
    textareaStyle,
  };
}
