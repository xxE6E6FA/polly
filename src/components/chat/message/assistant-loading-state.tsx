import { useEffect, useRef, useState } from "react";
import { SkeletonText } from "@/components/ui/skeleton-text";
import type { AssistantPhase } from "@/hooks";
import { Reasoning } from "../reasoning";
import { StatusIndicator } from "./status-indicator";

type AssistantLoadingStateProps = {
  messageId: string;
  phase: AssistantPhase;
  isActive: boolean;
  statusLabel?: string;
  reasoning?: string;
  thinkingDurationMs?: number;
};

// Set to true to enable debug logging for re-renders
const DEBUG_RENDERS = true;

/**
 * Extracted loading state component for assistant messages.
 * Contains: StatusIndicator, Reasoning panel, and SkeletonText.
 *
 * This component is separate to make debugging re-renders easier.
 * Enable DEBUG_RENDERS to log render information.
 */
export function AssistantLoadingState({
  messageId,
  phase,
  isActive,
  statusLabel,
  reasoning,
  thinkingDurationMs,
}: AssistantLoadingStateProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const hasReasoningText = Boolean(reasoning && reasoning.trim().length > 0);

  // Visibility booleans derived from phase
  const isLoading = phase === "loading";
  // Only show status indicator during loading (before reasoning arrives)
  // During reasoning phase, the Reasoning component header shows "Thinking for Xs"
  const showStatusIndicator = isLoading && !!statusLabel;
  const showSkeleton = isLoading && !hasReasoningText;

  // === DEBUG LOGGING ===
  const renderCountRef = useRef(0);
  const prevPropsRef = useRef<{
    messageId: string;
    phase: AssistantPhase;
    isActive: boolean;
    statusLabel?: string;
    hasReasoningText: boolean;
    showStatusIndicator: boolean;
    showSkeleton: boolean;
    showReasoning: boolean;
  } | null>(null);

  if (DEBUG_RENDERS) {
    renderCountRef.current += 1;
    const currentProps = {
      messageId,
      phase,
      isActive,
      statusLabel,
      hasReasoningText,
      showStatusIndicator,
      showSkeleton,
      showReasoning,
    };

    const prev = prevPropsRef.current;
    const changes: string[] = [];

    if (prev) {
      if (prev.phase !== phase) {
        changes.push(`phase: ${prev.phase} → ${phase}`);
      }
      if (prev.isActive !== isActive) {
        changes.push(`isActive: ${prev.isActive} → ${isActive}`);
      }
      if (prev.statusLabel !== statusLabel) {
        changes.push(`statusLabel: "${prev.statusLabel}" → "${statusLabel}"`);
      }
      if (prev.hasReasoningText !== hasReasoningText) {
        changes.push(
          `hasReasoningText: ${prev.hasReasoningText} → ${hasReasoningText}`
        );
      }
      if (prev.showStatusIndicator !== showStatusIndicator) {
        changes.push(
          `showStatusIndicator: ${prev.showStatusIndicator} → ${showStatusIndicator}`
        );
      }
      if (prev.showSkeleton !== showSkeleton) {
        changes.push(`showSkeleton: ${prev.showSkeleton} → ${showSkeleton}`);
      }
      if (prev.showReasoning !== showReasoning) {
        changes.push(`showReasoning: ${prev.showReasoning} → ${showReasoning}`);
      }
    }

    // Only log if there are changes or it's the first render
    if (changes.length > 0 || renderCountRef.current === 1) {
      // biome-ignore lint/suspicious/noConsole: Intentional debug logging controlled by DEBUG_RENDERS flag
      console.log(
        `[AssistantLoadingState] Render #${renderCountRef.current} | ${messageId.slice(0, 8)}...`,
        changes.length > 0
          ? `| Changes: ${changes.join(", ")}`
          : "| Initial render",
        { phase, isActive, showStatusIndicator, showSkeleton, showReasoning }
      );
    }

    prevPropsRef.current = currentProps;
  }
  // === END DEBUG LOGGING ===

  // Auto-behavior for reasoning visibility:
  // - expand during loading or reasoning phase when reasoning arrives
  // - collapse after content begins streaming (with 800ms delay for smoother transition)
  useEffect(() => {
    if (hasReasoningText && (phase === "loading" || phase === "reasoning")) {
      if (DEBUG_RENDERS) {
        // biome-ignore lint/suspicious/noConsole: Intentional debug logging
        console.log(
          "[AssistantLoadingState] Effect: expanding reasoning (hasReasoning && loading/reasoning phase)"
        );
      }
      setShowReasoning(true);
    }
  }, [hasReasoningText, phase]);

  useEffect(() => {
    if (phase === "streaming" && showReasoning) {
      if (DEBUG_RENDERS) {
        // biome-ignore lint/suspicious/noConsole: Intentional debug logging
        console.log(
          "[AssistantLoadingState] Effect: scheduling reasoning collapse (streaming phase)"
        );
      }
      // 800ms delay for smoother transition when content starts streaming
      const t = setTimeout(() => {
        if (DEBUG_RENDERS) {
          // biome-ignore lint/suspicious/noConsole: Intentional debug logging
          console.log("[AssistantLoadingState] Effect: collapsing reasoning");
        }
        setShowReasoning(false);
      }, 800);
      return () => clearTimeout(t);
    }
    return;
  }, [phase, showReasoning]);

  return (
    <>
      {/* Always-mounted status indicator */}
      <StatusIndicator label={statusLabel} visible={showStatusIndicator} />

      {/* Reasoning panel */}
      {hasReasoningText && (
        <div className="mb-2.5">
          <Reasoning
            isLoading={isActive}
            reasoning={reasoning || ""}
            expanded={showReasoning}
            onExpandedChange={setShowReasoning}
            hideHeader={phase === "loading"}
            finalDurationMs={thinkingDurationMs}
          />
        </div>
      )}

      {/* Skeleton placeholder */}
      <SkeletonText lines={3} className="max-w-[74ch]" visible={showSkeleton} />
    </>
  );
}
