import { useMemo, useState } from "react";
import type { AssistantPhase } from "@/hooks";
import { cn } from "@/lib/utils";
import type { ReasoningPart, ToolCall } from "@/types";
import { ReasoningSegment } from "./reasoning-segment";
import { ToolCallBlock } from "./tool-call-block";

const ICON_SIZE = "h-4 w-4";

type ActivityItem =
  | { type: "reasoning"; part: ReasoningPart; index: number }
  | { type: "tool"; toolCall: ToolCall };

type ActivityStreamProps = {
  reasoningParts?: ReasoningPart[];
  reasoning?: string;
  thinkingDurationMs?: number;
  toolCalls?: ToolCall[];
  isActive: boolean;
  phase?: AssistantPhase;
};

function buildSummaryLabel(
  reasoningCount: number,
  toolCallCount: number,
  thinkingDurationMs?: number
): string {
  const parts: string[] = [];

  if (reasoningCount > 0) {
    if (thinkingDurationMs && thinkingDurationMs > 0) {
      const seconds = Math.round(thinkingDurationMs / 1000);
      parts.push(`Thought for ${seconds}s`);
    } else {
      parts.push("Thoughts");
    }
  }

  if (toolCallCount > 0) {
    parts.push(
      toolCallCount === 1 ? "1 tool use" : `${toolCallCount} tool uses`
    );
  }

  return parts.join(" · ");
}

/**
 * Unified activity stream that merges reasoning segments and tool calls
 * into a single chronological list.
 *
 * While streaming, items render inside a subtle card container.
 * When the message is complete, the card collapses and a plain summary
 * toggle sits above it — clicking the toggle opens the card.
 */
export function ActivityStream({
  reasoningParts,
  reasoning,
  thinkingDurationMs,
  toolCalls,
  isActive,
  phase,
}: ActivityStreamProps) {
  const [expanded, setExpanded] = useState(false);

  // Build unified list sorted by startedAt (hooks must run before early return)
  const items = useMemo(() => {
    const hasParts = reasoningParts && reasoningParts.length > 0;
    const hasLegacy = !hasParts && Boolean(reasoning?.trim());
    const hasTools = toolCalls && toolCalls.length > 0;

    if (!(hasParts || hasLegacy || hasTools)) {
      return [];
    }

    const result: ActivityItem[] = [];

    if (hasParts) {
      for (let i = 0; i < reasoningParts.length; i++) {
        const part = reasoningParts[i];
        if (part?.text.trim()) {
          result.push({ type: "reasoning", part, index: i });
        }
      }
    } else if (hasLegacy) {
      result.push({
        type: "reasoning",
        part: { text: reasoning || "", startedAt: 0 },
        index: 0,
      });
    }

    if (hasTools) {
      for (const tc of toolCalls) {
        result.push({ type: "tool", toolCall: tc });
      }
    }

    result.sort((a, b) => {
      const aTime =
        a.type === "reasoning" ? a.part.startedAt : a.toolCall.startedAt;
      const bTime =
        b.type === "reasoning" ? b.part.startedAt : b.toolCall.startedAt;
      return aTime - bTime;
    });

    return result;
  }, [reasoningParts, reasoning, toolCalls]);

  const { reasoningCount, toolCallCount } = useMemo(() => {
    let rCount = 0;
    let tCount = 0;
    for (const item of items) {
      if (item.type === "reasoning") {
        rCount++;
      } else {
        tCount++;
      }
    }
    return { reasoningCount: rCount, toolCallCount: tCount };
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  const lastIndex = items.length - 1;
  const isComplete = phase === "complete";
  const summaryLabel = buildSummaryLabel(
    reasoningCount,
    toolCallCount,
    thinkingDurationMs
  );

  // When there's only one reasoning segment and no tool calls, the outer
  // ActivityStream toggle already shows "Thought for Xs" — skip the inner one.
  const isSoloReasoning = reasoningCount === 1 && toolCallCount === 0;

  const streamContent = (
    <div className="stack-sm">
      {items.map((item, i) => {
        if (item.type === "reasoning") {
          const isLast = i === lastIndex;
          return (
            <ReasoningSegment
              key={`reasoning-${item.index}`}
              text={item.part.text}
              isActive={isActive && isLast}
              bare={isSoloReasoning}
              thinkingDurationMs={
                !isActive && isLast ? thinkingDurationMs : undefined
              }
            />
          );
        }

        return (
          <ToolCallBlock key={item.toolCall.id} toolCall={item.toolCall} />
        );
      })}
    </div>
  );

  // While streaming: card with live items
  if (!isComplete) {
    return (
      <div className="mb-3 mx-0 sm:-mx-6 rounded-xl sm:rounded-[1.65rem] border border-input-border bg-muted shadow-sm px-4 sm:px-6 py-3">
        {streamContent}
      </div>
    );
  }

  // Complete: plain toggle + expandable card below
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg
          className={cn(
            ICON_SIZE,
            "shrink-0 transition-transform duration-200",
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
        <span>{summaryLabel}</span>
      </button>

      <div
        className="mx-0 sm:-mx-6 grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-2 rounded-xl sm:rounded-[1.65rem] border border-input-border bg-muted shadow-sm px-4 sm:px-6 py-3 overflow-hidden">
            {streamContent}
          </div>
        </div>
      </div>
    </div>
  );
}
