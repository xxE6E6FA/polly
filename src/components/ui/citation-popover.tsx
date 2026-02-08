import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Citation domain model.
 */
export interface Citation {
  url: string;
  title: string;
  favicon?: string;
  siteName?: string;
  description?: string;
}

/**
 * Shared props for the popup-only component.
 * This component assumes it is rendered inside <PreviewCard.Popup>.
 */
export interface CitationPreviewPopupProps {
  citations: Citation[];
  /**
   * Starting index when multiple citations are present.
   * Defaults to 0.
   */
  initialIndex?: number;
  /**
   * Callback whenever active index changes.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Optional className merges with base styles.
   */
  className?: string;
  /**
   * If true, hides navigation header (even if multiple citations).
   */
  hideHeader?: boolean;
  /**
   * If true, hides dot navigation at bottom.
   */
  hideDotNav?: boolean;
  /**
   * If true, hides footer action buttons.
   */
  hideFooter?: boolean;
  /**
   * Override default “Open” button behavior.
   */
  onOpenSource?: (citation: Citation) => void;
  /**
   * Provide a close handler (invoked by footer Close button).
   * The component itself does not manage PreviewCard open state.
   */
  onRequestClose?: () => void;
  /**
   * Optional accessible label formatter for navigation header.
   */
  formatIndexLabel?: (current: number, total: number) => string;
}

/**
 * Utility: derive display name from citation.
 */
function getDisplayName(citation: Citation) {
  if (citation.siteName) {
    return citation.siteName;
  }
  try {
    return new URL(citation.url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/**
 * Pure popup content for citation previews.
 * Renders:

 *  Header (prev/next + index)
 *  Main citation details
 *  Dot navigation (for grouped citations)
 *  Footer actions (Open / Close)
 *
 * Intentionally does NOT wrap with PreviewCard.Root / Popup / Positioner.
 * Caller should place this inside <PreviewCard.Popup>.
 */
export const CitationPreviewPopup: React.FC<CitationPreviewPopupProps> = ({
  citations,
  initialIndex = 0,
  onIndexChange,
  className,
  // Legacy props ignored in new design
  hideHeader,
  hideDotNav,
  hideFooter,
  onOpenSource,
  onRequestClose,
  formatIndexLabel,
}) => {
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialIndex), citations.length - 1)
  );

  // Reset index if citations array changes length drastically
  useEffect(() => {
    setIndex(prev => (prev >= citations.length ? citations.length - 1 : prev));
  }, [citations.length]);

  const setIndexSafe = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(0, next), citations.length - 1);
      setIndex(clamped);
      onIndexChange?.(clamped);
    },
    [citations.length, onIndexChange]
  );

  const hasMultiple = citations.length > 1;
  const current = citations[index];
  if (!current) {
    return null;
  }

  return (
    <fieldset
      aria-label={
        hasMultiple
          ? `Citation preview (${index + 1} of ${citations.length})`
          : "Citation preview"
      }
      className={cn(
        "citation-preview-popup w-80 select-none outline-none",
        // Surface styling (matches design tokens)
        "rounded-xl border border-border/50 bg-popover shadow-xl",
        "overflow-hidden",
        // Transition hooks (parent PreviewCard will add starting/ending data attributes)
        "data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]",
        "data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]",
        className
      )}
    >
      {!hideHeader && hasMultiple && (
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2",
            "border-b border-border/40 bg-secondary/20"
          )}
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 hover:bg-background/80"
              onClick={e => {
                e.stopPropagation();
                setIndexSafe(index - 1);
              }}
              disabled={index === 0}
              aria-label="Previous citation"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 hover:bg-background/80"
              onClick={e => {
                e.stopPropagation();
                setIndexSafe(index + 1);
              }}
              disabled={index === citations.length - 1}
              aria-label="Next citation"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
          <span
            className="text-overline font-medium text-muted-foreground/70"
            aria-live="polite"
          >
            {formatIndexLabel
              ? formatIndexLabel(index, citations.length)
              : `${index + 1} / ${citations.length}`}
          </span>
        </div>
      )}

      <a
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group block focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "hover:bg-secondary/50 transition-colors"
        )}
      >
        <div className="p-4 stack-md">
          <div className="flex items-start gap-3">
            {current.favicon ? (
              <img
                src={current.favicon}
                alt=""
                className="h-8 w-8 mt-0.5 flex-shrink-0 rounded-md shadow-sm border border-border/50 object-cover bg-background"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="h-8 w-8 mt-0.5 flex-shrink-0 rounded-md shadow-sm border border-border/50 bg-secondary flex items-center justify-center text-secondary-foreground">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0 stack-xs">
              <div
                className={cn(
                  "font-semibold text-sm leading-tight line-clamp-2",
                  "text-foreground group-hover:text-primary transition-colors"
                )}
              >
                {current.title}
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate">
                {getDisplayName(current)}
              </div>
            </div>
          </div>
        </div>
      </a>

      {/* Remove bottom dot nav as we have top nav now */}
    </fieldset>
  );
};

CitationPreviewPopup.displayName = "CitationPreviewPopup";
