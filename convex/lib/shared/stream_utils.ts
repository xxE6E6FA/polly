/**
 * Shared stream processing utilities for handling reasoning tokens
 * across both Convex and client-side implementations
 */

export type StreamPartType =
  | "text-delta"
  | "reasoning"
  | "thinking_delta"
  | "thinking"
  | "step-start"
  | "step-finish";

export interface StreamPart {
  type: string;
  textDelta?: string;
  text?: string;
  thinking?: string;
}

/**
 * Determines if a stream part contains reasoning content
 */
export function isReasoningPart(part: StreamPart): boolean {
  return (
    part.type === "reasoning" ||
    part.type === "thinking_delta" ||
    part.type === "thinking" ||
    part.type === "step-start" ||
    part.type === "step-finish"
  );
}

/**
 * Extracts reasoning content from a stream part
 */
export function extractReasoningContent(part: StreamPart): string | undefined {
  if (!isReasoningPart(part)) {
    return undefined;
  }

  // Handle different formats from different providers
  const partWithContent = part as StreamPart & {
    thinking?: string;
    text?: string;
  };

  return (
    part.textDelta || partWithContent.text || partWithContent.thinking || ""
  );
}

/**
 * Configuration for stream processing
 */
export interface StreamConfig {
  BATCH_SIZE: number;
  BATCH_TIMEOUT: number;
  CHECK_STOP_EVERY_N_CHUNKS: number;
  ABORT_TIMEOUT_MS: number;
  STOP_CHECK_INTERVAL_MS: number;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  BATCH_SIZE: 30,
  BATCH_TIMEOUT: 75,
  CHECK_STOP_EVERY_N_CHUNKS: 2,
  ABORT_TIMEOUT_MS: 5000,
  STOP_CHECK_INTERVAL_MS: 250,
};



/**
 * Humanize reasoning text by removing technical artifacts
 */
export function humanizeReasoningText(text: string): string {
  return text
    .replace(/<thinking>|<\/thinking>/g, "")
    .replace(/<reasoning>|<\/reasoning>/g, "")
    .replace(/\[reasoning]|\[\/reasoning]/gi, "")
    .replace(/^Thinking:\s*/i, "");
}
