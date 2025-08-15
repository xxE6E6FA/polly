import Markdown from "markdown-to-jsx";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/spinner";

type ReasoningProps = {
  reasoning: string;
  isLoading: boolean;
};

export const Reasoning = ({ reasoning, isLoading }: ReasoningProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastReasoningLenRef = useRef<number>(0);

  // Auto-expand when streaming starts, auto-collapse when streaming ends
  useEffect(() => {
    if (isLoading) {
      setIsExpanded(true);
    } else {
      // Auto-collapse when streaming finishes
      setIsExpanded(false);
    }
  }, [isLoading]);

  // Scroll to bottom when content grows while expanded
  const reasoningLength = reasoning?.length ?? 0;
  useEffect(() => {
    const element = contentRef.current;
    if (!(element && isExpanded)) {
      return;
    }
    if (lastReasoningLenRef.current !== reasoningLength) {
      element.scrollTop = element.scrollHeight;
      lastReasoningLenRef.current = reasoningLength;
    }
  }, [reasoningLength, isExpanded]);

  // Don't show a secondary "thinking" state; only render when there is content
  if (!reasoning?.trim()) {
    return null;
  }

  return (
    <div className="py-2">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        {/* Show spinner when loading in collapsed state */}
        {isLoading && !isExpanded ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <svg
            className={`h-3 w-3 transition-transform duration-200 ${
              isExpanded ? "" : "group-hover:scale-110"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        )}
        <span>
          {isLoading && !isExpanded
            ? "Thinking through your request..."
            : isExpanded
              ? "Hide reasoning"
              : "Show reasoning"}
        </span>
      </button>

      {/* Container for content with transitions and loading animation */}
      <div
        className={`
          relative mt-2 w-full overflow-hidden border-l-2
          border-muted/30 pl-4 transition-all duration-300 ease-in-out
          dark:border-l-muted/20
          ${
            isLoading
              ? isExpanded
                ? "h-[150px] bg-muted/5"
                : "h-0 opacity-0"
              : isExpanded
                ? "h-auto translate-y-0 opacity-100"
                : "h-0 -translate-y-2 opacity-0"
          }
        `}
      >
        {/* Inner scrollable content area */}
        <div
          ref={contentRef}
          className={`
            scrollbar-none relative h-full
            overflow-y-auto
            scroll-smooth
            py-3
            text-xs
            text-muted-foreground
            [-ms-overflow-style:none]
            [scrollbar-width:none] dark:text-muted-foreground/80 [&::-webkit-scrollbar]:hidden
          `}
        >
          <div
            className="max-w-none break-words text-xs leading-relaxed text-muted-foreground/90 dark:text-muted-foreground/80"
            style={{
              wordBreak: "break-word",
              overflowWrap: "break-word",
              hyphens: "auto",
            }}
          >
            <Markdown>{reasoning || ""}</Markdown>
            {/* Add a small spacer at the bottom for better scroll visibility */}
            {isLoading && <div className="h-4" />}
          </div>
        </div>

        {/* Gradient overlays for focus effect (only during loading) */}
        {isLoading && isExpanded && (
          <>
            {/* Top fade - text fades out going up */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-6 bg-gradient-to-b from-background via-background/60 to-transparent"
            />
            {/* Bottom fade - text fades out going down */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-6 bg-gradient-to-t from-background via-background/60 to-transparent"
            />
          </>
        )}
      </div>
    </div>
  );
};
