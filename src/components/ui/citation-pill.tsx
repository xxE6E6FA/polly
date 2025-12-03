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
        "h-auto px-2 py-0.5 text-[11px] font-medium text-secondary-foreground bg-secondary/50 hover:bg-secondary/80 border border-border/50 transition-colors rounded-full inline-flex items-center align-baseline no-underline mx-0.5",
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
