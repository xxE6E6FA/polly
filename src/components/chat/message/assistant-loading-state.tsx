import { SkeletonText } from "@/components/ui/skeleton-text";
import type { AssistantPhase } from "@/hooks";
import type { ReasoningPart, ToolCall } from "@/types";
import { ActivityStream } from "../activity-stream";

type AssistantLoadingStateProps = {
  phase: AssistantPhase;
  isActive: boolean;
  reasoning?: string;
  reasoningParts?: ReasoningPart[];
  thinkingDurationMs?: number;
  toolCalls?: ToolCall[];
};

/**
 * Loading state for assistant messages.
 * Delegates activity rendering to the unified ActivityStream component,
 * and shows a skeleton placeholder when no activity has arrived yet.
 */
export function AssistantLoadingState({
  phase,
  isActive,
  reasoning,
  reasoningParts,
  thinkingDurationMs,
  toolCalls,
}: AssistantLoadingStateProps) {
  const hasActivity =
    (reasoningParts?.length ?? 0) > 0 ||
    Boolean(reasoning?.trim()) ||
    (toolCalls?.length ?? 0) > 0;
  const showSkeleton = phase === "loading" && !hasActivity;

  // Reasoning is only "active" before content starts streaming.
  // Once the phase transitions to streaming/complete, reasoning is done.
  const reasoningIsActive =
    isActive && (phase === "loading" || phase === "reasoning");

  return (
    <>
      <ActivityStream
        reasoningParts={reasoningParts}
        reasoning={reasoning}
        thinkingDurationMs={thinkingDurationMs}
        toolCalls={toolCalls}
        isActive={reasoningIsActive}
        phase={phase}
      />
      <SkeletonText lines={3} className="max-w-[74ch]" visible={showSkeleton} />
    </>
  );
}
