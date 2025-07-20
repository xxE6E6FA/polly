/**
 * Shared constants used across the entire application
 */

import { ProviderType } from "./provider-constants";

// User limits
export const MONTHLY_MESSAGE_LIMIT = 500;
export const ANONYMOUS_MESSAGE_LIMIT = 10;

// Model constants
export const DEFAULT_POLLY_MODEL_ID = "gemini-2.5-flash-lite-preview-06-17";

// Polly model detection
export function isPollyModel(provider?: string): boolean {
  return provider === "polly";
}

export function mapPollyModelToProvider(modelId: string): ProviderType {
  // Map specific Polly models to their actual providers
  if (modelId === DEFAULT_POLLY_MODEL_ID) {
    return "google";
  }
  // Default fallback - this should be updated as more models are added
  return "google";
}

// Streaming defaults
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 8192; // Generous default for conversations

// Batch processing
export const MESSAGE_BATCH_SIZE = 50; // Batch size for message deletion
export const CHUNK_SIZE = 10; // Chunk size for export processing
export const BATCH_SIZE = 20; // Batch size for import processing

// Search
export const WEB_SEARCH_MAX_RESULTS = 12; // Default max Exa search results - matches Exa demo default 