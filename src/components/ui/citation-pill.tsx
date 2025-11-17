import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CitationPillProps {
  favicon?: string;
  sourceName: string;
  groupCount?: number;
  href: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenChange: (open: boolean) => void;
}

export const CitationPill = React.forwardRef<
  HTMLButtonElement,
  CitationPillProps
>(
  (
    {
      favicon,
      sourceName,
      groupCount,
      href,
      onMouseEnter,
      onMouseLeave,
      onOpenChange,
    },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-5 gap-1 px-2 py-1 text-xs leading-tight align-baseline rounded-full inline-flex"
        )}
        style={{ verticalAlign: "baseline" }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onMouseEnter}
        onBlur={onMouseLeave}
        onPointerDown={e => {
          e.preventDefault();
        }}
        onClick={e => {
          e.preventDefault();
          // Scroll to citation in the gallery
          const citationId = href.slice(1);
          if (!citationId) {
            return;
          }

          const element = document.getElementById(citationId);
          if (!element) {
            return;
          }

          try {
            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          } catch (error) {
            console.warn("Failed to scroll to citation:", error);
          }
        }}
      >
        {favicon && (
          <img
            src={favicon}
            alt=""
            className="h-2.5 w-2.5 flex-shrink-0"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="leading-none">
          {sourceName}
          {groupCount && groupCount > 1 && ` +${groupCount - 1}`}
        </span>
      </Button>
    );
  }
);

CitationPill.displayName = "CitationPill";
