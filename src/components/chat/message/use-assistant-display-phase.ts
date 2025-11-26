import { useEffect, useMemo, useRef, useState } from "react";

export type AssistantPhase =
  | "awaiting" // bubble created, no signals yet
  | "precontent" // show a single status chip/skeleton
  | "streaming" // text is streaming and visible
  | "complete" // finished or stopped
  | "error";

type Params = {
  isStreamingProp: boolean;
  messageStatus?: string;
  contentLength: number;
  hasReasoning: boolean;
};

const MIN_CHARS_FOR_CONTENT = 24; // gate content reveal to reduce first-token flicker
const PRECONTENT_DEBOUNCE_MS = 300; // wait before showing any loader to avoid flashes

export function useAssistantDisplayPhase({
  isStreamingProp,
  messageStatus,
  contentLength,
  hasReasoning,
}: Params) {
  const [phase, setPhase] = useState<AssistantPhase>("awaiting");
  const [showPrecontent, setShowPrecontent] = useState(false);
  const streamStartRef = useRef<number | null>(null);

  // Determine if we should reveal content (either enough chars or a short time has elapsed)
  const revealContent = useMemo(() => {
    if (!isStreamingProp) {
      return contentLength > 0; // after streaming, just show whatever exists
    }
    if (contentLength >= MIN_CHARS_FOR_CONTENT) {
      return true;
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const startedAt = streamStartRef.current ?? now;
    return now - startedAt >= PRECONTENT_DEBOUNCE_MS; // fallback time gate
  }, [isStreamingProp, contentLength]);

  // Track the start time of streaming
  useEffect(() => {
    if (isStreamingProp && streamStartRef.current === null) {
      streamStartRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    if (!isStreamingProp) {
      streamStartRef.current = null;
    }
  }, [isStreamingProp]);

  // Debounce showing any pre-content loader to avoid brief flashes
  useEffect(() => {
    if (!isStreamingProp) {
      setShowPrecontent(false);
      return;
    }
    if (contentLength > 0) {
      setShowPrecontent(false);
      return;
    }
    const t = setTimeout(() => setShowPrecontent(true), PRECONTENT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [isStreamingProp, contentLength]);

  // Map to a stable phase with minimal transitions to reduce layout shifts
  useEffect(() => {
    if (messageStatus === "error") {
      setPhase("error");
      return;
    }

    // Complete when status explicitly done or stopped
    if (
      !isStreamingProp &&
      (messageStatus === "done" || messageStatus === "stopped")
    ) {
      setPhase("complete");
      return;
    }

    // If we have content or time gate, move to streaming
    if (revealContent) {
      setPhase(isStreamingProp ? "streaming" : "complete");
      return;
    }

    // Otherwise, show a stable pre-content state (if debounced on)
    if (showPrecontent || hasReasoning) {
      setPhase("precontent");
      return;
    }

    setPhase("awaiting");
  }, [
    isStreamingProp,
    messageStatus,
    revealContent,
    showPrecontent,
    hasReasoning,
  ]);

  // A single prioritized status label for the pre-content phase
  const statusLabel = useMemo(() => {
    // Unified copy: "Searching…" or "Thinking…"
    if (messageStatus === "searching") {
      return "Searching…";
    }
    if (isStreamingProp && contentLength === 0) {
      return "Thinking…";
    }
    if (messageStatus === "reading_pdf" || messageStatus === "thinking") {
      return "Thinking…";
    }
    return undefined;
  }, [messageStatus, isStreamingProp, contentLength]);

  return { phase, statusLabel } as const;
}
