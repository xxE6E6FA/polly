import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  generateTextWithProvider,
  isTextGenerationAvailable,
} from "./ai/text_generation";

/**
 * Generate a one-shot summary for an entire conversation.
 * Used by branching/continue-in-new-conversation flows.
 */
export const generateConversationSummary = action({
  args: {
    conversationId: v.id("conversations"),
    maxOutputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string> => {
    if (!isTextGenerationAvailable()) {
      return "Previous conversation (context not available)";
    }

    try {
      // Get conversation messages
      const messages: Doc<"messages">[] = await ctx.runMutation(
        internal.messages.internalGetAllInConversation,
        { conversationId: args.conversationId }
      );

      if (!messages || messages.length === 0) {
        return "Previous conversation (no messages found)";
      }

      // Format messages for summarization
      const conversationText: string = messages
        .filter((msg: Doc<"messages">) => msg.role !== "system")
        .map((msg: Doc<"messages">) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          return `${role}: ${msg.content}`;
        })
        .join("\n\n");

      if (!conversationText.trim()) {
        return "Previous conversation (no content found)";
      }

      const prompt = `Please provide a concise summary of the following conversation between a user and an AI assistant. Focus on the key topics discussed, questions asked, and main points covered. Keep the summary under ${args.maxOutputTokens || 150} words and make it suitable as context for continuing the conversation in a new thread.

Conversation:
${conversationText}

Summary:`;

      const summary = await generateTextWithProvider({
        prompt,
        maxOutputTokens: 1000,
        temperature: 0.7,
      });

      if (!summary.trim()) {
        throw new Error("No summary generated");
      }

      return summary.trim();
    } catch (error) {
      console.error("Error generating conversation summary:", error);
      return "Previous conversation (summary not available)";
    }
  },
});
