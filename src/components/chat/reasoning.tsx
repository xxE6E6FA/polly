import Markdown from "markdown-to-jsx";
import { useEffect, useMemo, useRef, useState } from "react";

function getReasoningButtonLabel(
  isLoading: boolean,
  displayLabel: string | null
): string {
  if (isLoading) {
    return displayLabel ? `Thinking for ${displayLabel}` : "Thinking";
  }
  return displayLabel ? `Thought for ${displayLabel}` : "Thoughts";
}

// Spinner no longer used here; header uses a static icon and timer for a cleaner look

type ReasoningProps = {
  reasoning: string;
  isLoading: boolean;
  // Optional controlled expansion to integrate with parent triggers
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  // When true, do not render the header/trigger; only render the content panel
  hideHeader?: boolean;
  // Optional persisted thinking duration from server (ms)
  finalDurationMs?: number;
};

export const Reasoning = ({
  reasoning,
  isLoading,
  expanded,
  onExpandedChange,
  hideHeader = false,
  finalDurationMs,
}: ReasoningProps) => {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : uncontrolledExpanded;
  const contentRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const lastReasoningLenRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);
  const [_isAnimating, setIsAnimating] = useState(false);

  // No auto-expand/collapse to avoid layout shifts.

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

  // Measure content height for smooth expand/collapse
  useEffect(() => {
    const el = measureRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      setMeasuredHeight(el.scrollHeight);
    });
    ro.observe(el);
    // Initial measure
    setMeasuredHeight(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  // Track elapsed thinking time (starts when reasoning first appears while loading)
  useEffect(() => {
    let raf = 0;
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const tick = () => {
      if (startTimeRef.current != null) {
        setElapsedMs(now() - startTimeRef.current);
        raf = requestAnimationFrame(tick);
      }
    };
    if (isLoading && reasoningLength > 0) {
      if (startTimeRef.current == null) {
        startTimeRef.current = now();
      }
      raf = requestAnimationFrame(tick);
    } else if (!isLoading && startTimeRef.current != null) {
      // Freeze value; keep last elapsed
      cancelAnimationFrame(raf);
    }
    return () => cancelAnimationFrame(raf);
  }, [isLoading, reasoningLength]);

  const displayLabel = useMemo(() => {
    const ms =
      finalDurationMs && finalDurationMs > 0 ? finalDurationMs : elapsedMs;
    const secs = Math.max(0, Math.round(ms / 1000));
    if (secs <= 0) {
      return undefined;
    }
    return `${secs}s`;
  }, [elapsedMs, finalDurationMs]);

  // Don't show a secondary "thinking" state; only render when there is content
  if (!reasoning?.trim()) {
    return null;
  }

  const toggle = () => {
    setIsAnimating(true);
    if (isControlled) {
      onExpandedChange?.(!isExpanded);
    } else {
      setUncontrolledExpanded(prev => !prev);
    }
    // Stop animating after transition window
    window.setTimeout(() => setIsAnimating(false), 220);
  };

  // Header visibility controlled by parent; we do NOT auto-hide during streaming
  // so users can toggle reasoning while the answer streams.
  const shouldHideHeader = hideHeader;

  return (
    <div className="py-2">
      {!shouldHideHeader && (
        <button
          type="button"
          onClick={toggle}
          className="mb-2 flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground"
        >
          {/* Caret icon that rotates when expanded */}
          <svg
            className={`h-3 w-3 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : "rotate-0"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span>
            {getReasoningButtonLabel(isLoading, displayLabel ?? null)}
          </span>
        </button>
      )}

      {/* Container for content with transitions and loading animation */}
      <div
        className={`
          relative mt-2 w-[calc(100%+24px)] sm:w-[calc(100%+48px)] rounded-xl border border-border bg-muted/30 shadow-sm dark:bg-muted/20
          max-w-none mx-[-12px] sm:mx-[-24px] overflow-hidden
          transition-[max-height,opacity,transform] duration-normal ease-standard
          ${isExpanded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-0.5"}
        `}
        style={{
          maxHeight: isExpanded ? Math.max(80, measuredHeight + 24) : 0,
        }}
        aria-hidden={!isExpanded}
      >
        {/* Inner scrollable content area */}
        <div
          ref={contentRef}
          className="scrollbar-none relative h-full overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            ref={measureRef}
            className="py-3 sm:py-6 px-3 sm:px-6 text-foreground/90"
          >
            <div
              className="break-words text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8] max-w-[74ch] transition-opacity duration-fast ease-standard"
              style={{
                wordBreak: "break-word",
                overflowWrap: "break-word",
                hyphens: "auto",
                opacity: isExpanded ? 1 : 0,
              }}
            >
              <Markdown
                options={{
                  forceBlock: true,
                  overrides: {
                    p: {
                      component: "p",
                      props: { className: "mb-2 last:mb-0" },
                    },
                    ul: {
                      component: "ul",
                      props: {
                        className:
                          "mb-2 ml-5 list-disc stack-sm marker:text-muted-foreground/60",
                      },
                    },
                    ol: {
                      component: "ol",
                      props: {
                        className:
                          "mb-2 ml-5 list-decimal stack-sm marker:text-muted-foreground/60",
                      },
                    },
                    li: { component: "li", props: { className: "[&>p]:mb-0" } },
                    strong: {
                      component: "strong",
                      props: { className: "font-semibold text-foreground" },
                    },
                    em: { component: "em", props: { className: "italic" } },
                    a: {
                      component: "a",
                      props: {
                        className:
                          "underline underline-offset-2 decoration-muted-foreground/50 hover:text-foreground",
                        target: "_blank",
                        rel: "noreferrer",
                      },
                    },
                    code: {
                      component: "code",
                      props: {
                        className:
                          "rounded bg-muted/40 px-1.5 py-0.5 text-[0.85em] font-medium",
                      },
                    },
                    h1: {
                      component: "h1",
                      props: { className: "mb-2 text-[1.05rem] font-semibold" },
                    },
                    h2: {
                      component: "h2",
                      props: { className: "mb-2 text-[1.02rem] font-semibold" },
                    },
                    h3: {
                      component: "h3",
                      props: { className: "mb-1.5 text-[1rem] font-medium" },
                    },
                  },
                }}
              >
                {reasoning || ""}
              </Markdown>
              {isLoading && <div className="h-4" />}
            </div>
          </div>
        </div>
        {/* Clean Grok-like card: no gradient overlays */}
      </div>
    </div>
  );
};
