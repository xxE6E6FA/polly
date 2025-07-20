import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_POLLY_MODEL_ID } from "@shared/constants";
import { v } from "convex/values";

import { api } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";

export const generateTitle = action({
  args: {
    message: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<string> => {
    const apiKey = process.env.GEMINI_API_KEY;
    let generatedTitle: string;

    if (apiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_POLLY_MODEL_ID}:generateContent?key=${apiKey}`,
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
                      text: `Generate a concise, descriptive title (max 60 characters) for a conversation that starts with this message. Only return the title, no quotes or extra text:\n\n"${args.message}"`,
                    },
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 20,
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
        const clean = args.message.replace(/[#*`]/g, "").trim();
        generatedTitle =
          clean.length > 60
            ? `${clean.substring(0, 57)}...`
            : clean || "New conversation";
      }
    } else {
      // Fallback to simple title generation if no API key
      const clean = args.message.replace(/[#*`]/g, "").trim();
      generatedTitle =
        clean.length > 60
          ? `${clean.substring(0, 57)}...`
          : clean || "New conversation";
    }

    // Update the conversation title if conversationId is provided
    if (args.conversationId) {
      await ctx.runMutation(api.conversations.patch, {
        id: args.conversationId,
        updates: { title: generatedTitle },
        setUpdatedAt: false,
      });
    }

    return generatedTitle;
  },
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
      await ctx.runAction(api.titleGeneration.generateTitle, {
        message: args.message,
        conversationId: args.conversationId,
      });
    } catch (error) {
      console.error(
        `Title generation failed (attempt ${retryCount + 1}):`,
        error
      );

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delayMs = 2 ** retryCount * 1000; // 1s, 2s, 4s
        await ctx.scheduler.runAfter(
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
        const fallbackTitle = args.message.slice(0, 60) || "New conversation";
        await ctx.runMutation(api.conversations.patch, {
          id: args.conversationId,
          updates: { title: fallbackTitle },
          setUpdatedAt: false,
        });
      }
    }
  },
});

// Internal mutation for batch title updates (for migrations or bulk operations)
export const batchUpdateTitles = internalMutation({
  args: {
    updates: v.array(
      v.object({
        conversationId: v.id("conversations"),
        title: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
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
        const reason =
          result.status === "rejected" ? result.reason : "Unknown error";
        console.error(
          `Failed to update conversation ${update.conversationId}:`,
          reason
        );
      });
    }
  },
});
