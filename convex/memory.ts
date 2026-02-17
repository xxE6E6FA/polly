/**
 * Memory CRUD operations — queries and mutations for user memories.
 * The extraction action lives in memory_actions.ts (requires "use node").
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  createEmptyPaginationResult,
  paginationOptsSchema,
  validatePaginationOpts,
} from "./lib/pagination";
import { memoryCategorySchema } from "./lib/schemas";

// ============================================================================
// INTERNAL QUERIES (used by extraction action)
// ============================================================================

/** Check if user has memory enabled */
export const getUserMemorySettings = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();
    return settings ? { memoryEnabled: settings.memoryEnabled ?? false } : null;
  },
});

/** Get recent messages from a conversation */
export const getRecentMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(args.limit);
    return messages
      .reverse()
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
  },
});

/** Get eligible conversations for memory scan (non-archived, >= 4 messages).
 *  Note: Uses N+1 pattern (1 conversation query + N message queries). This is
 *  bounded by `limit` (max 50) and each sub-query only reads 4 indexed docs,
 *  which is acceptable for a one-off background scan trigger. */
export const getEligibleConversations = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", args.userId).eq("isArchived", false)
      )
      .order("desc")
      .take(args.limit);

    const eligible = [];
    for (const conv of conversations) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", q => q.eq("conversationId", conv._id))
        .take(4);
      if (msgs.length >= 4) {
        eligible.push({ _id: conv._id, title: conv.title });
      }
    }
    return eligible;
  },
});

// ============================================================================
// INTERNAL MUTATIONS (used by extraction action)
// ============================================================================

/** Insert a new memory */
export const insertMemory = internalMutation({
  args: {
    userId: v.id("users"),
    content: v.string(),
    category: memoryCategorySchema,
    sourceConversationId: v.optional(v.id("conversations")),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Look up conversation title if sourceConversationId is provided
    let sourceConversationTitle: string | undefined;
    if (args.sourceConversationId) {
      const conversation = await ctx.db.get(args.sourceConversationId);
      sourceConversationTitle = conversation?.title;
    }

    return await ctx.db.insert("userMemories", {
      userId: args.userId,
      content: args.content,
      category: args.category,
      sourceConversationId: args.sourceConversationId,
      sourceConversationTitle,
      embedding: args.embedding,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update an existing memory's content and embedding */
export const updateMemoryContent = internalMutation({
  args: {
    memoryId: v.id("userMemories"),
    content: v.string(),
    category: memoryCategorySchema,
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, {
      content: args.content,
      category: args.category,
      embedding: args.embedding,
      updatedAt: Date.now(),
    });
  },
});

/** Patch assistant message with extracted memories */
export const patchMemoriesExtracted = internalMutation({
  args: {
    messageId: v.id("messages"),
    memories: v.array(
      v.object({
        content: v.string(),
        category: memoryCategorySchema,
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      memoriesExtracted: args.memories,
    });
  },
});

/** Get a single memory by ID (internal, no auth check) */
export const getMemoryById = internalQuery({
  args: { id: v.id("userMemories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// PUBLIC QUERIES (for settings UI)
// ============================================================================

/** Get approximate memory count for the authenticated user.
 *  Uses .take(100) to avoid scanning the full table — returns "99+" for large sets. */
export const getMemoryCount = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { count: 0, isApproximate: false };
    }

    const memories = await ctx.db
      .query("userMemories")
      .withIndex("by_user_active", q =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .take(100);
    return {
      count: memories.length,
      isApproximate: memories.length === 100,
    };
  },
});

/** List memories with pagination (for VirtualizedDataList) */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsSchema,
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return createEmptyPaginationResult();
    }

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    if (!validatedOpts) {
      return createEmptyPaginationResult();
    }

    const searchQuery = args.searchQuery?.trim();
    const sortDirection = args.sortDirection ?? "desc";

    if (searchQuery) {
      const result = await ctx.db
        .query("userMemories")
        .withSearchIndex("search_content", q =>
          q.search("content", searchQuery).eq("userId", userId)
        )
        .paginate(validatedOpts);
      return result;
    }

    const result = await ctx.db
      .query("userMemories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order(sortDirection)
      .paginate(validatedOpts);

    return result;
  },
});

/** Get a single memory by ID */
export const get = query({
  args: { id: v.id("userMemories") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) {
      return null;
    }
    return memory;
  },
});

// ============================================================================
// PUBLIC MUTATIONS (for settings UI)
// ============================================================================

/** Toggle a memory active/inactive */
export const toggleActive = mutation({
  args: { id: v.id("userMemories") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) {
      throw new Error("Memory not found");
    }
    await ctx.db.patch(args.id, {
      isActive: !memory.isActive,
      updatedAt: Date.now(),
    });
  },
});

/** Delete a memory */
export const remove = mutation({
  args: { id: v.id("userMemories") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) {
      throw new Error("Memory not found");
    }
    await ctx.db.delete(args.id);
  },
});

/** Delete a batch of memories. Returns whether more remain so the caller can re-invoke. */
export const clearAll = mutation({
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const batch = await ctx.db
      .query("userMemories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .take(100);
    for (const memory of batch) {
      await ctx.db.delete(memory._id);
    }
    return { deleted: batch.length, hasMore: batch.length === 100 };
  },
});
