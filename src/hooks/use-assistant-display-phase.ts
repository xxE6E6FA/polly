import { useMemo } from "react";

export type AssistantPhase =
  | "loading"
  | "reasoning"
  | "streaming"
  | "complete"
  | "error";

type Params = {
  messageStatus?: string;
  hasContent: boolean;
  hasReasoning: boolean;
};

const ACTIVE_STATUSES = ["streaming", "thinking", "searching", "reading_pdf"];

/**
 * Derives the display phase for an assistant message.
 *
 * This hook is purely derived from props with no internal state,
 * eliminating timer-based transitions that can cause animation resets.
 *
 * Phases:
 * - loading: Message created but no content yet (show skeleton/spinner)
 * - reasoning: Has reasoning text but no content yet (show reasoning panel)
 * - streaming: Content is actively streaming (show content)
 * - complete: Message is done (show content + actions)
 * - error: Message has an error
 */
export function useAssistantDisplayPhase({
  messageStatus,
  hasContent,
  hasReasoning,
}: Params) {
  const isActive = ACTIVE_STATUSES.includes(messageStatus ?? "");

  const phase = useMemo((): AssistantPhase => {
    // Error state takes precedence
    if (messageStatus === "error") {
      return "error";
    }

    // Complete: not active AND explicitly done/stopped
    if (
      !isActive &&
      (messageStatus === "done" || messageStatus === "stopped")
    ) {
      return "complete";
    }

    // Complete: not active but has content (loaded from DB)
    if (!isActive && hasContent) {
      return "complete";
    }

    // Reasoning: active, has reasoning but no content yet
    if (isActive && hasReasoning && !hasContent) {
      return "reasoning";
    }

    // Streaming: active AND has content
    if (isActive && hasContent) {
      return "streaming";
    }

    // Loading: everything else (active but no content yet)
    return "loading";
  }, [isActive, messageStatus, hasContent, hasReasoning]);

  // Status label for the loading indicator
  const statusLabel = useMemo(() => {
    if (messageStatus === "searching") {
      return "Searching…";
    }
    if (messageStatus === "reading_pdf") {
      return "Reading…";
    }
    // Show "Thinking…" for thinking status, reasoning phase, or generic loading
    if (
      messageStatus === "thinking" ||
      phase === "reasoning" ||
      (phase === "loading" && isActive)
    ) {
      return "Thinking…";
    }
    return undefined;
  }, [messageStatus, phase, isActive]);

  return { phase, statusLabel, isActive } as const;
}
