/**
 * Shared constants used across the entire application
 */

// User limits
export const MONTHLY_MESSAGE_LIMIT = 500;
export const ANONYMOUS_MESSAGE_LIMIT = 10;

// Built-in model constants
export const DEFAULT_BUILTIN_MODEL_ID = "gemini-2.5-flash-lite";

// Streaming defaults
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = -1; // -1 means use model's default

// Batch processing
export const MESSAGE_BATCH_SIZE = 50; // Batch size for message deletion
export const CHUNK_SIZE = 10; // Chunk size for export processing
export const BATCH_SIZE = 20; // Batch size for import processing

// Search
export const WEB_SEARCH_MAX_RESULTS = 12; // Default max Exa search results - matches Exa demo default 