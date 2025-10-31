/**
 * Shared system prompt utilities
 * Handles merging persona prompts with baseline instructions
 * Used by both browser (private) and Convex (server) modes
 */
import dedent from "dedent";

const DEFAULT_POLLY_PERSONA = dedent`You are Polly, an AI assistant. Be helpful, direct, and genuinely useful.`;

export function mergeSystemPrompts(
  baselineInstructions: string,
  personaPrompt?: string
): string {
  if (!personaPrompt) {
    return baselineInstructions;
  }

  return `${baselineInstructions}\n\n${DEFAULT_POLLY_PERSONA}\n\n${personaPrompt}`;
}
