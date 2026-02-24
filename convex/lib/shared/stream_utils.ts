/**
 * Shared stream processing utilities for handling reasoning tokens
 * across both Convex and client-side implementations
 */

/**
 * Type guard for AI SDK v5 reasoning delta chunks
 */
export function isReasoningDelta(
  chunk: { type?: string; text?: string }
): chunk is { type: "reasoning-delta"; text: string } {
  return chunk.type === "reasoning-delta" && typeof chunk.text === "string";
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
  BATCH_SIZE: 80,
  BATCH_TIMEOUT: 150,
  CHECK_STOP_EVERY_N_CHUNKS: 5,
  ABORT_TIMEOUT_MS: 5000,
  STOP_CHECK_INTERVAL_MS: 250,
};



/**
 * Humanize reasoning text by removing technical artifacts
 */
export function humanizeReasoningText(text: string): string {
  return text
    .replace(/<thinking>|<\/thinking>/g, "")
    .replace(/<think>|<\/think>/g, "") // Moonshot Kimi format
    .replace(/<reasoning>|<\/reasoning>/g, "")
    .replace(/\[reasoning]|\[\/reasoning]/gi, "")
    .replace(/^Thinking:\s*/i, "");
}
