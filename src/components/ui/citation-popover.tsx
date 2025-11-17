import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Animation timing constant
const POPOVER_ANIMATION_DURATION = 200; // milliseconds

export interface Citation {
  url: string;
  title: string;
  favicon?: string;
  siteName?: string;
}

interface CitationPopoverContentProps {
  citations: Citation[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenChange: (open: boolean) => void;
}

const getDisplayName = (citation: Citation) => {
  if (citation.siteName) {
    return citation.siteName;
  }
  try {
    return new URL(citation.url).hostname.replace("www.", "");
  } catch {
    return "website";
  }
};

export const CitationPopoverContent: React.FC<CitationPopoverContentProps> = ({
  citations,
  onMouseEnter,
  onMouseLeave,
  onOpenChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // Reset currentIndex when citations change
  useEffect(() => {
    setCurrentIndex(0);
  }, []);

  // Handle exit animation
  const handleMouseLeave = () => {
    setIsExiting(true);
    // Delay the actual mouse leave to allow animation
    setTimeout(() => {
      onMouseLeave();
    }, POPOVER_ANIMATION_DURATION);
  };

  const currentCitation = citations[currentIndex] ?? citations[0];
  if (!currentCitation) {
    return null;
  }

  return (
    <PopoverContent
      className={cn(
        "w-80 p-0 transition-opacity duration-200",
        isExiting ? "opacity-0" : "opacity-100"
      )}
      side="top"
      align="start"
      onMouseEnter={onMouseEnter}
      onMouseLeave={handleMouseLeave}
      onOpenAutoFocus={e => {
        e.preventDefault();
      }}
      onCloseAutoFocus={e => {
        e.preventDefault();
      }}
    >
      {citations.length > 1 && (
        <div className="flex items-center justify-between p-2 border-b border-border">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={e => {
              e.stopPropagation();
              setCurrentIndex(Math.max(0, currentIndex - 1));
            }}
            disabled={currentIndex === 0}
            aria-label="Previous citation"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} of {citations.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={e => {
              e.stopPropagation();
              setCurrentIndex(Math.min(citations.length - 1, currentIndex + 1));
            }}
            disabled={currentIndex === citations.length - 1}
            aria-label="Next citation"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
      )}
      <a
        href={currentCitation.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "block p-3 hover:bg-muted/50 transition-colors rounded-b-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <div className="flex items-start gap-2">
          {currentCitation.favicon && (
            <img
              src={currentCitation.favicon}
              alt=""
              className="h-4 w-4 mt-0.5 flex-shrink-0"
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground mb-1">
              {getDisplayName(currentCitation)}
            </div>
            <div className="font-medium text-sm line-clamp-2 text-foreground">
              {currentCitation.title}
            </div>
          </div>
        </div>
      </a>
    </PopoverContent>
  );
};

CitationPopoverContent.displayName = "CitationPopoverContent";
