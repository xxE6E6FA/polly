import Markdown, { RuleType } from "markdown-to-jsx/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  applyHardLineBreaks,
  MathCode,
  renderTextWithMathAndCitations,
  tryRenderMath,
  wrapMathInCodeSpans,
} from "@/lib/markdown-utils";
import { cn } from "@/lib/utils";

const ICON_SIZE = "size-4";

type ReasoningSegmentProps = {
  text: string;
  isActive: boolean;
  /** Render content only, no toggle — used when a parent already provides one. */
  bare?: boolean;
  thinkingDurationMs?: number;
};

/**
 * A compact, expandable reasoning segment in the activity stream.
 *
 * Collapsed: `▸ Thought for 3s`
 * Expanded:  `▾ Thought for 3s` + bordered markdown content
 * Active:    spinner + `Thinking for 3s` with pulse, content visible
 */
export function ReasoningSegment({
  text,
  isActive,
  bare = false,
  thinkingDurationMs,
}: ReasoningSegmentProps) {
  const [expanded, setExpanded] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Track elapsed thinking time — update every second for a calm display
  useEffect(() => {
    if (!isActive || text.length === 0) {
      if (!isActive && startTimeRef.current != null) {
        startTimeRef.current = null;
      }
      return;
    }

    if (startTimeRef.current == null) {
      startTimeRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    const id = setInterval(() => {
      if (startTimeRef.current != null) {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        setElapsedMs(now - startTimeRef.current);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isActive, text.length]);

  const displayLabel = useMemo(() => {
    if (thinkingDurationMs && thinkingDurationMs > 0) {
      return `${Math.round(thinkingDurationMs / 1000)}s`;
    }
    if (elapsedMs > 0) {
      return `${Math.round(elapsedMs / 1000)}s`;
    }
    return null;
  }, [elapsedMs, thinkingDurationMs]);

  const label = (() => {
    if (isActive) {
      return displayLabel ? `Thinking for ${displayLabel}` : "Thinking";
    }
    return displayLabel ? `Thought for ${displayLabel}` : "Thoughts";
  })();

  const isOpen = expanded || isActive;

  // Wrap math in backtick code spans so markdown-to-jsx preserves LaTeX verbatim.
  const safeText = useMemo(() => wrapMathInCodeSpans(text), [text]);

  const reasoningContent = (
    <div className="relative max-w-[74ch]">
      <div className="py-1 text-sm leading-relaxed text-muted-foreground">
        <Markdown
          options={{
            forceBlock: true,
            overrides: markdownOverrides,
            renderRule(next, node) {
              // Inline code with math delimiters → render KaTeX directly
              if (
                node.type === RuleType.codeInline &&
                typeof node.text === "string"
              ) {
                const mathNode = tryRenderMath(node.text);
                if (mathNode) {
                  return mathNode;
                }
              }
              if (
                node.type === RuleType.text &&
                typeof node.text === "string"
              ) {
                const transformed = renderTextWithMathAndCitations(node.text);
                return applyHardLineBreaks(transformed);
              }
              return next();
            },
          }}
        >
          {safeText}
        </Markdown>
      </div>

      {/* Bottom gradient fade — hints at more content */}
      {!isActive && text.length > 600 && !expanded && !bare && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/80 to-transparent" />
      )}
    </div>
  );

  // Bare mode: content only, no toggle — parent provides the chrome
  if (bare) {
    return reasoningContent;
  }

  return (
    <div>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="group flex items-center gap-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {isActive ? (
          <Spinner size="sm" />
        ) : (
          <svg
            className={cn(
              ICON_SIZE,
              "transition-transform duration-200",
              expanded ? "rotate-90" : "rotate-0"
            )}
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
        )}
        <span className={cn(isActive && "thinking-pulse")}>{label}</span>
      </button>

      {/* Expandable content — grid animation for smooth open/close */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-1 ml-1.5 border-l-2 border-muted-foreground/15 pl-4">
            {reasoningContent}
          </div>
        </div>
      </div>
    </div>
  );
}

// Markdown overrides — muted, compact styling for reasoning text
const markdownOverrides = {
  p: {
    component: "p" as const,
    props: { className: "mb-2 last:mb-0" },
  },
  ul: {
    component: "ul" as const,
    props: {
      className: "mb-2 ml-5 list-disc stack-xs marker:text-muted-foreground/40",
    },
  },
  ol: {
    component: "ol" as const,
    props: {
      className:
        "mb-2 ml-5 list-decimal stack-xs marker:text-muted-foreground/40",
    },
  },
  li: {
    component: "li" as const,
    props: { className: "[&>p]:mb-0" },
  },
  strong: {
    component: "strong" as const,
    props: { className: "font-medium text-muted-foreground" },
  },
  em: {
    component: "em" as const,
    props: { className: "italic" },
  },
  a: {
    component: "a" as const,
    props: {
      className:
        "underline underline-offset-2 decoration-muted-foreground/30 hover:text-foreground",
      target: "_blank",
      rel: "noreferrer",
    },
  },
  code: {
    component: MathCode,
    props: {
      className: "rounded bg-muted/40 px-1 py-0.5 text-xs font-medium",
    },
  },
  h1: {
    component: "h1" as const,
    props: { className: "mb-2 text-sm font-semibold text-muted-foreground" },
  },
  h2: {
    component: "h2" as const,
    props: { className: "mb-2 text-sm font-semibold text-muted-foreground" },
  },
  h3: {
    component: "h3" as const,
    props: { className: "mb-1.5 text-sm font-medium text-muted-foreground" },
  },
};
