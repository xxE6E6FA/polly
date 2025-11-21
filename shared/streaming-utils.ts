/**
 * Shared streaming utilities for both server and browser-side AI streaming
 * Provides common configuration and helpers to reduce duplication
 */

import { smoothStream } from "ai";

/**
 * Standard smooth stream configuration used across the app
 * - 8ms delay for balanced responsiveness and smooth rendering
 * - CJK-aware chunking for better handling of Chinese/Japanese/Korean text
 */
export const SMOOTH_STREAM_CONFIG = {
  delayInMs: 8,
  // CJK characters (Chinese, Japanese, Korean) or words with trailing whitespace
  chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
} as const;

/**
 * Creates a smooth stream transform with standard configuration
 * Use this instead of creating smoothStream inline for consistency
 */
export function createSmoothStreamTransform() {
  return smoothStream(SMOOTH_STREAM_CONFIG);
}

/**
 * Type guard to check if a chunk is a reasoning delta
 * Used in onChunk callbacks to detect reasoning tokens
 */
export function isReasoningDelta(chunk: {
  type?: string;
  text?: string;
}): chunk is { type: "reasoning-delta"; text: string } {
  return chunk.type === "reasoning-delta" && typeof chunk.text === "string";
}

/**
 * Standard abort error check
 * Returns true if the error is a user-initiated abort (not a real error)
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Common streaming options builder
 * Filters out undefined/null values and provides sensible defaults
 */
export interface StreamingOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  topK?: number;
  repetitionPenalty?: number;
}

/**
 * Normalizes streaming options, removing undefined values and applying defaults
 */
export function normalizeStreamingOptions(
  options?: StreamingOptions
): Record<string, number> {
  const normalized: Record<string, number> = {};

  if (options?.temperature !== undefined) {
    normalized.temperature = options.temperature;
  }
  if (options?.maxTokens !== undefined && options.maxTokens > 0) {
    normalized.maxOutputTokens = options.maxTokens;
  }
  if (options?.topP !== undefined) {
    normalized.topP = options.topP;
  }
  if (options?.frequencyPenalty !== undefined) {
    normalized.frequencyPenalty = options.frequencyPenalty;
  }
  if (options?.presencePenalty !== undefined) {
    normalized.presencePenalty = options.presencePenalty;
  }
  if (options?.topK !== undefined) {
    normalized.topK = options.topK;
  }
  if (options?.repetitionPenalty !== undefined) {
    normalized.repetitionPenalty = options.repetitionPenalty;
  }

  return normalized;
}

/**
 * Callback interface for streaming events
 * Use this for consistent callback signatures across streaming implementations
 */
export interface StreamCallbacks {
  onContent: (chunk: string) => void;
  onReasoning?: (delta: string) => void;
  onFinish: (reason: "stop" | "length" | "error" | "user_stopped") => void;
  onError: (error: Error) => void;
}

/**
 * Helper to create a standardized onChunk handler for reasoning detection
 */
export function createReasoningChunkHandler(
  onReasoning?: (delta: string) => void
): (args: { chunk: unknown }) => void {
  return ({ chunk }) => {
    if (
      onReasoning &&
      typeof chunk === "object" &&
      chunk !== null &&
      isReasoningDelta(chunk as { type?: string; text?: string })
    ) {
      onReasoning((chunk as { type: string; text: string }).text);
    }
  };
}
