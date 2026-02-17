import { z } from "zod/v3";
import dedent from "dedent";

/** Schema for a single extracted memory from the LLM */
export const extractedMemorySchema = z.object({
  content: z.string(),
  category: z.enum(["preference", "fact", "instruction"]),
});

export type ExtractedMemoryItem = z.infer<typeof extractedMemorySchema>;

/**
 * Build the extraction prompt for the LLM.
 * Dedup is handled at save time via vector search — the LLM just extracts candidates.
 */
export function buildExtractionPrompt(
  recentMessages: Array<{ role: string; content: string }>,
): string {
  const messagesText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return dedent`
    Analyze the following conversation and extract DURABLE facts about the USER that would be useful to remember across future conversations.

    CATEGORIES:
    - "preference": Likes/dislikes, style choices, tool preferences (e.g., "Prefers TypeScript over JavaScript")
    - "fact": Personal info, job, location, projects, skills (e.g., "Works as a backend engineer at Google")
    - "instruction": Standing instructions for AI behavior (e.g., "Always explain code changes before making them")

    RULES:
    1. Only extract facts ABOUT THE USER, not about the conversation topic
    2. Only extract DURABLE facts that would be relevant in future conversations
    3. Do NOT extract: conversation-specific context, temporary states, task details, or things the user is asking about (vs things about themselves)
    4. Be concise — each memory should be a single clear statement
    5. Extract 0-3 memories per conversation turn — prefer quality over quantity. Most conversations will have 0 new memories.
    6. If there is nothing NEW and durable to extract, return an empty array

    RECENT CONVERSATION:
    ${messagesText}

    Extract memories as a JSON array.
  `;
}
