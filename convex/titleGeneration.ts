import { v } from "convex/values";
import { DEFAULT_BUILTIN_MODEL_ID } from "../shared/constants";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { scheduleRunAfter } from "./lib/scheduler";

// Helper function to generate title without updating conversation
async function generateTitleHelper(message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  let generatedTitle: string;

  if (apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_BUILTIN_MODEL_ID}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Generate a short title (2-5 words, max 40 characters) for this chat message. Be direct and specific. Avoid phrases like "Discussion about", "Help with", or "Question regarding".

Examples of good titles:
- "React Router Migration"
- "Fix Login Bug"
- "Database Schema Design"

Message: "${message}"

Title:`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 10,
              temperature: 0.3,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const title = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!title) {
        throw new Error("No title generated");
      }

      generatedTitle = title;
    } catch (error) {
      console.error("Error generating title with Gemini:", error);
      // Fallback to simple title generation
      const clean = message.replace(/[#*`]/g, "").trim();
      generatedTitle =
        clean.length > 40
          ? `${clean.substring(0, 37)}...`
          : clean || "New conversation";
    }
  } else {
    // Fallback to simple title generation if no API key
    const clean = message.replace(/[#*`]/g, "").trim();
    generatedTitle =
      clean.length > 40
        ? `${clean.substring(0, 37)}...`
        : clean || "New conversation";
  }

  return generatedTitle;
}

export async function generateTitleHandler(
  ctx: ActionCtx,
  args: { message: string; conversationId?: Id<"conversations"> }
): Promise<string> {
  const generatedTitle = await generateTitleHelper(args.message);

  // Update the conversation title if conversationId is provided
  if (args.conversationId) {
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: { title: generatedTitle },
      setUpdatedAt: true,
    });
  }

  return generatedTitle;
}

export const generateTitle = action({
  args: {
    message: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: generateTitleHandler,
});

// Optimized background title generation with retry logic
export const generateTitleBackground = action({
  args: {
    conversationId: v.id("conversations"),
    message: v.string(),
    retryCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const maxRetries = 3;
    const retryCount = args.retryCount || 0;

    try {
      const generatedTitle = await generateTitleHelper(args.message);

      // Update the conversation title
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { title: generatedTitle },
        setUpdatedAt: true,
      });
    } catch (error) {
      console.error(
        `Title generation failed (attempt ${retryCount + 1}):`,
        error
      );

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delayMs = 2 ** retryCount * 1000; // 1s, 2s, 4s
        await scheduleRunAfter(
          ctx,
          delayMs,
          api.titleGeneration.generateTitleBackground,
          {
            conversationId: args.conversationId,
            message: args.message,
            retryCount: retryCount + 1,
          }
        );
      } else {
        // Final fallback - set a simple title
        const fallbackTitle = args.message.slice(0, 40) || "New conversation";
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: args.conversationId,
          updates: { title: fallbackTitle },
          setUpdatedAt: true,
        });
      }
    }
  },
});

// Internal mutation for batch title updates (for migrations or bulk operations)
export async function batchUpdateTitlesHandler(
  ctx: MutationCtx,
  args: {
    updates: Array<{ conversationId: Id<"conversations">; title: string }>;
  }
) {
  // Update all titles in parallel with error handling for partial failures
  const results = await Promise.allSettled(
    args.updates.map(update =>
      ctx.db.patch(update.conversationId, {
        title: update.title,
      })
    )
  );

  // Log any failures without stopping the entire batch
  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === "rejected");

  if (failures.length > 0) {
    console.error(
      `Batch title update had ${failures.length} failures out of ${args.updates.length} total updates:`
    );
    failures.forEach(({ result, index }) => {
      const update = args.updates[index];
      if (!update) {
        console.error("Failed to determine update payload for failure", result);
        return;
      }
      const reason =
        result.status === "rejected" ? result.reason : "Unknown error";
      console.error(
        `Failed to update conversation ${update.conversationId}:`,
        reason
      );
    });
  }
}

export const batchUpdateTitles = internalMutation({
  args: {
    updates: v.array(
      v.object({
        conversationId: v.id("conversations"),
        title: v.string(),
      })
    ),
  },
  handler: batchUpdateTitlesHandler,
});
