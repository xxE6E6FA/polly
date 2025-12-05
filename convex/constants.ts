/**
 * Backend-specific constants for Convex
 */

// Re-export system prompt utilities from shared module
export {
  BASELINE_SYSTEM_INSTRUCTIONS,
  CITATION_INSTRUCTIONS,
  DEFAULT_POLLY_PERSONA,
  getBaselineInstructions,
  mergeSystemPrompts,
} from "../shared/system-prompts";

// Max allowed characters in a single user message before rejection
export const MAX_USER_MESSAGE_CHARS = 50_000; // ~12.5k tokens heuristic
