import { v } from "convex/values";

import { action } from "./_generated/server";
import {
  generateTextWithProvider,
  isTextGenerationAvailable,
} from "./ai/text_generation";

const FALLBACK_STARTERS = [
  "Can you explain this in more detail?",
  "What are the implications of this?",
  "How does this relate to other concepts?",
  "Can you give me a practical example?",
  "What are the pros and cons of this approach?",
];

export const generateConversationStarters = action({
  args: {
    selectedText: v.string(),
  },
  handler: async (_ctx, args) => {
    if (!isTextGenerationAvailable()) {
      return FALLBACK_STARTERS;
    }

    try {
      const prompt = `You are generating conversation starter prompts that will be used to start NEW conversations with an AI assistant. These prompts are inspired by this selected text, but the new AI won't have any context about the original text.

Selected text: "${args.selectedText}"

Create 5 diverse, self-contained prompts that:
- Are inspired by the selected text but stand alone as complete conversation starters
- Each explores a DIFFERENT aspect or angle of the topic (practical applications, step-by-step guides, real-world examples, comparisons, troubleshooting, best practices, etc.)
- Include enough context so a new AI can understand what you're asking about
- Are specific and actionable rather than vague or generic
- Feel like natural opening questions someone genuinely interested in the topic would ask
- Lead to valuable, detailed responses that go beyond surface-level information

Each prompt should be a complete, standalone request that doesn't reference "this" or assume prior knowledge.

Return exactly 5 prompts, one per line, with no numbers, bullets, or formatting.`;

      const content = await generateTextWithProvider({
        prompt,
        maxTokens: 1000,
        temperature: 0.7,
      });

      if (!content.trim()) {
        throw new Error("No content generated");
      }

      // Parse the response into individual prompts
      const prompts = content
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .slice(0, 5); // Ensure we only get 5 prompts

      return prompts;
    } catch (error) {
      console.error("Error generating conversation starters:", error);
      return FALLBACK_STARTERS;
    }
  },
});
