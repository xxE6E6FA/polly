import type * as React from "react";
import { cn } from "@/lib/utils";

type CitationPillProps = {
  sourceName: string;
  groupCount?: number;
  className?: string;
  ref?: React.Ref<HTMLSpanElement>;
};

export function CitationPill({
  sourceName,
  groupCount,
  className,
  ref,
}: CitationPillProps) {
  return (
    <span
      ref={ref}
      className={cn(
        "h-auto px-2 py-0.5 text-xs font-medium text-secondary-foreground bg-secondary/50 hover:bg-secondary/80 border border-border transition-colors rounded-full inline-flex items-center align-baseline no-underline mx-0.5",
        className
      )}
      style={{
        verticalAlign: "baseline",
        lineHeight: "1.4",
      }}
    >
      {sourceName}
      {groupCount && groupCount > 1 && ` +${groupCount - 1}`}
    </span>
  );
}

type CitationPillSkeletonProps = {
  /** The citation number(s) to display, e.g. "1" or "1,2,3" */
  citationText: string;
  className?: string;
};

/**
 * Skeleton placeholder for citation pills shown during streaming.
 * Matches the dimensions of CitationPill for smooth transition.
 */
export function CitationPillSkeleton({
  citationText,
  className,
}: CitationPillSkeletonProps) {
  return (
    <span
      className={cn(
        "h-auto px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full inline-flex items-center align-baseline no-underline mx-0.5 animate-pulse",
        className
      )}
      style={{
        verticalAlign: "baseline",
        lineHeight: "1.4",
      }}
    >
      {citationText}
    </span>
  );
}
