import { v } from "convex/values";
import { z } from "zod/v3";

import { action } from "./_generated/server";
import {
  generateArrayWithProvider,
  isTextGenerationAvailable,
} from "./ai/text_generation";

const FALLBACK_STARTERS = [
  "Can you explain this in more detail?",
  "What are the implications of this?",
  "How does this relate to other concepts?",
  "Can you give me a practical example?",
  "What are the pros and cons of this approach?",
];

// AI SDK v6: Schema for structured conversation starter generation
const starterSchema = z
  .string()
  .min(10)
  .max(500)
  .describe("A self-contained conversation starter prompt");

export const generateConversationStarters = action({
  args: {
    selectedText: v.string(),
  },
  handler: async (_ctx, args) => {
    if (!isTextGenerationAvailable()) {
      return FALLBACK_STARTERS;
    }

    try {
      // AI SDK v6: Use Output.array() for structured, validated array generation
      const prompt = `You are generating conversation starter prompts that will be used to start NEW conversations with an AI assistant. These prompts are inspired by this selected text, but the new AI won't have any context about the original text.

Selected text: "${args.selectedText}"

Create 5 diverse, self-contained prompts that:
- Are inspired by the selected text but stand alone as complete conversation starters
- Each explores a DIFFERENT aspect or angle of the topic (practical applications, step-by-step guides, real-world examples, comparisons, troubleshooting, best practices, etc.)
- Include enough context so a new AI can understand what you're asking about
- Are specific and actionable rather than vague or generic
- Feel like natural opening questions someone genuinely interested in the topic would ask
- Lead to valuable, detailed responses that go beyond surface-level information

Each prompt should be a complete, standalone request that doesn't reference "this" or assume prior knowledge.`;

      const prompts = await generateArrayWithProvider({
        prompt,
        elementSchema: starterSchema,
        schemaName: "conversationStarters",
        schemaDescription: "Array of 5 conversation starter prompts",
        maxOutputTokens: 1000,
        temperature: 0.7,
      });

      // Ensure we only get up to 5 prompts
      return prompts.slice(0, 5);
    } catch (error) {
      console.error("Error generating conversation starters:", error);
      return FALLBACK_STARTERS;
    }
  },
});
