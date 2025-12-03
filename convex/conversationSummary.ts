import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  generateTextWithProvider,
  isTextGenerationAvailable,
} from "./ai/text_generation";

// Shared handler function for getting conversation summaries
async function handleGetConversationSummaries(
  ctx: QueryCtx,
  args: {
    conversationId: Doc<"conversations">["_id"];
    limit?: number;
  }
): Promise<Doc<"conversationSummaries">[]> {
  const limit = args.limit || 50;

  return await ctx.db
    .query("conversationSummaries")
    .withIndex("by_conversation_chunk", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc")
    .take(limit);
}

// Shared handler function for upserting conversation summary
async function handleUpsertConversationSummary(
  ctx: MutationCtx,
  args: {
    conversationId: Doc<"conversations">["_id"];
    chunkIndex: number;
    summary: string;
    messageCount: number;
    firstMessageId: Doc<"messages">["_id"];
    lastMessageId: Doc<"messages">["_id"];
  }
) {
  const now = Date.now();

  // Check if summary already exists
  const existingSummary = await ctx.db
    .query("conversationSummaries")
    .withIndex("by_conversation_chunk", q =>
      q
        .eq("conversationId", args.conversationId)
        .eq("chunkIndex", args.chunkIndex)
    )
    .first();

  if (existingSummary) {
    // Update existing summary
    await ctx.db.patch(existingSummary._id, {
      summary: args.summary,
      messageCount: args.messageCount,
      firstMessageId: args.firstMessageId,
      lastMessageId: args.lastMessageId,
      updatedAt: now,
    });
    return existingSummary._id;
  }

  // Create new summary
  return await ctx.db.insert("conversationSummaries", {
    conversationId: args.conversationId,
    chunkIndex: args.chunkIndex,
    summary: args.summary,
    messageCount: args.messageCount,
    firstMessageId: args.firstMessageId,
    lastMessageId: args.lastMessageId,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Store a chunk summary for a conversation
 */
export const storeChunkSummary = mutation({
  args: {
    conversationId: v.id("conversations"),
    chunkIndex: v.number(),
    summary: v.string(),
    messageCount: v.number(),
    firstMessageId: v.id("messages"),
    lastMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("conversationSummaries", {
      conversationId: args.conversationId,
      chunkIndex: args.chunkIndex,
      summary: args.summary,
      messageCount: args.messageCount,
      firstMessageId: args.firstMessageId,
      lastMessageId: args.lastMessageId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateConversationSummary = action({
  args: {
    conversationId: v.id("conversations"),
    maxTokens: v.optional(v.number()),
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

      const prompt = `Please provide a concise summary of the following conversation between a user and an AI assistant. Focus on the key topics discussed, questions asked, and main points covered. Keep the summary under ${args.maxTokens || 150} words and make it suitable as context for continuing the conversation in a new thread.

Conversation:
${conversationText}

Summary:`;

      const summary = await generateTextWithProvider({
        prompt,
        maxTokens: 1000,
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

// ==================== Summary Management ====================

export const getConversationSummaries = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args): Promise<Doc<"conversationSummaries">[]> =>
    handleGetConversationSummaries(ctx, args),
});

export const getConversationSummary = query({
  args: {
    conversationId: v.id("conversations"),
    chunkIndex: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"conversationSummaries"> | null> => {
    return await ctx.db
      .query("conversationSummaries")
      .withIndex("by_conversation_chunk", q =>
        q
          .eq("conversationId", args.conversationId)
          .eq("chunkIndex", args.chunkIndex)
      )
      .first();
  },
});

export const upsertConversationSummary = mutation({
  args: {
    conversationId: v.id("conversations"),
    chunkIndex: v.number(),
    summary: v.string(),
    messageCount: v.number(),
    firstMessageId: v.id("messages"),
    lastMessageId: v.id("messages"),
  },
  handler: (ctx, args) => handleUpsertConversationSummary(ctx, args),
});

// ==================== Internal Functions ====================

export const internalGetConversationSummaries = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args): Promise<Doc<"conversationSummaries">[]> =>
    handleGetConversationSummaries(ctx, args),
});

export const internalUpsertConversationSummary = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    chunkIndex: v.number(),
    summary: v.string(),
    messageCount: v.number(),
    firstMessageId: v.id("messages"),
    lastMessageId: v.id("messages"),
  },
  handler: (ctx, args) => handleUpsertConversationSummary(ctx, args),
});

// ==================== Background Summary Generation ====================

export const generateMissingSummaries = internalAction({
  args: {
    conversationId: v.id("conversations"),
    forceRegenerate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const { conversationId, forceRegenerate = false } = args;

      // Get all messages for the conversation
      const messages = await ctx.runQuery(api.messages.getAllInConversation, {
        conversationId,
      });

      if (!messages || messages.length === 0) {
        return;
      }

      // Get existing summaries
      const existingSummaries = await ctx.runQuery(
        internal.conversationSummary.internalGetConversationSummaries,
        {
          conversationId,
        }
      );

      const CHUNK_SIZE = 15;
      const chunks: Doc<"messages">[][] = [];

      // Split messages into chunks
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        chunks.push(messages.slice(i, i + CHUNK_SIZE));
      }

      // Generate summaries for chunks that need them
      for (let i = 0; i < chunks.length - 1; i++) {
        // Skip last chunk (recent messages)
        const chunk = chunks[i];
        if (!chunk || chunk.length === 0) {
          continue;
        }
        const chunkIndex = i;

        // Check if we need to generate/regenerate this summary
        const existingSummary = existingSummaries.find(
          (s: Doc<"conversationSummaries">) => s.chunkIndex === chunkIndex
        );
        const needsSummary =
          !existingSummary ||
          existingSummary.messageCount !== chunk.length ||
          forceRegenerate;

        if (needsSummary) {
          const firstMessage = chunk[0];
          const lastMessage = chunk[chunk.length - 1];
          if (!(firstMessage && lastMessage)) {
            continue;
          }
          // Generate summary using LLM
          const summary = await generateChunkSummary(chunk);

          // Store the summary
          await ctx.runMutation(
            internal.conversationSummary.internalUpsertConversationSummary,
            {
              conversationId,
              chunkIndex,
              summary,
              messageCount: chunk.length,
              firstMessageId: firstMessage._id as Id<"messages">,
              lastMessageId: lastMessage._id as Id<"messages">,
            }
          );
        }
      }
    } catch (error) {
      console.error("Error generating missing summaries:", error);
    }
  },
});

async function generateChunkSummary(chunk: Doc<"messages">[]): Promise<string> {
  const conversationText = chunk
    .filter(msg => msg.role !== "system")
    .map(msg => {
      const role = msg.role === "user" ? "User" : "Assistant";
      return `${role}: ${msg.content}`;
    })
    .join("\n\n");

  const createFallbackSummary = () =>
    `${chunk
      .filter(msg => msg.role !== "system")
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n\n")
      .substring(0, 300)}...`;

  if (!isTextGenerationAvailable()) {
    return createFallbackSummary();
  }

  try {
    const prompt = `You are an expert at summarizing conversations between users and AI assistants. Your task is to create a rich, comprehensive summary that preserves the most important information for conversation continuity.

Please analyze the following conversation excerpt and create a summary that captures:

1. **Main Topics & Themes**: What subjects were discussed? What was the primary focus?
2. **Key Questions & Requests**: What did the user want to know or accomplish?
3. **Important Insights & Explanations**: What key information, concepts, or conclusions were shared?
4. **Context & Background**: What context or setup was established?
5. **Conversation Flow**: How did the discussion progress? What was the logical sequence?

Guidelines:
- Be comprehensive but concise (aim for 300-400 characters)
- Preserve technical accuracy and domain-specific terminology
- Maintain the conversational tone and context
- Focus on information that would be useful for continuing the conversation
- If the conversation covers multiple topics, organize them logically
- Use clear, structured language that another AI can easily understand
- Adapt your summary style to the domain (technical, casual, academic, etc.)

Conversation excerpt:
${conversationText}

Rich Summary:`;

    const summary = await generateTextWithProvider({
      prompt,
      maxTokens: 500,
      temperature: 0.2,
      topP: 0.9,
    });

    if (!summary.trim()) {
      throw new Error("No summary generated");
    }

    return summary.trim();
  } catch (error) {
    console.error("Error generating chunk summary:", error);
    return createFallbackSummary();
  }
}
