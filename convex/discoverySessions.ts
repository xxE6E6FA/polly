import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "./lib/auth";

const MAX_CONTEXT_PROMPTS = 10;

// ============================================================================
// Queries
// ============================================================================

/**
 * List discovery sessions for the current user, newest first.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const sessions = await ctx.db
      .query("discoverySessions")
      .withIndex("by_user_updated", q => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    return sessions;
  },
});

/**
 * Get a session by its UUID string (used for resume).
 */
export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      return null;
    }

    return session;
  },
});

/**
 * Get session with its generation history (joined via by_batch index).
 * Reactions from the session doc are merged into the generation entries.
 */
export const getWithHistory = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      return null;
    }

    // Fetch generations for this session via the by_batch index
    const generations = await ctx.db
      .query("generations")
      .withIndex("by_batch", q => q.eq("batchId", args.sessionId))
      .order("asc")
      .collect();

    // Build reaction lookup
    const reactionMap = new Map<
      Id<"generations">,
      "liked" | "disliked" | "saved"
    >();
    for (const r of session.reactions) {
      reactionMap.set(r.generationId, r.reaction);
    }

    // Resolve image URLs and merge reactions
    const entries = await Promise.all(
      generations
        .filter(g => !g.isArchived)
        .map(async gen => {
          let imageUrl: string | null = null;
          if (gen.storageIds?.[0]) {
            imageUrl = await ctx.storage.getUrl(gen.storageIds[0]);
          }

          let status: "succeeded" | "failed" | "generating";
          if (gen.status === "succeeded") {
            status = "succeeded";
          } else if (gen.status === "failed" || gen.status === "canceled") {
            status = "failed";
          } else {
            status = "generating";
          }

          return {
            generationId: gen._id,
            prompt: gen.prompt,
            imageUrl,
            aspectRatio: gen.params?.aspectRatio ?? "1:1",
            status,
            reaction: reactionMap.get(gen._id) ?? null,
            explanation: gen.explanation,
          };
        })
    );

    return { session, entries };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new discovery session.
 */
export const create = mutation({
  args: {
    sessionId: v.string(),
    seedPrompt: v.optional(v.string()),
    seedImageStorageId: v.optional(v.id("_storage")),
    modelId: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();
    const id = await ctx.db.insert("discoverySessions", {
      userId,
      sessionId: args.sessionId,
      seedPrompt: args.seedPrompt,
      seedImageStorageId: args.seedImageStorageId,
      modelId: args.modelId,
      personaId: args.personaId,
      aspectRatio: args.aspectRatio,
      likedPrompts: [],
      dislikedPrompts: [],
      reactions: [],
      generationCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Record a reaction (like/dislike/save) on a generation within a session.
 * Updates the reactions array and likedPrompts/dislikedPrompts sliding windows.
 */
export const recordReaction = mutation({
  args: {
    sessionId: v.string(),
    generationId: v.id("generations"),
    prompt: v.string(),
    reaction: v.union(
      v.literal("liked"),
      v.literal("disliked"),
      v.literal("saved")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      throw new Error("Session not found");
    }

    // Update or add reaction
    const existingIdx = session.reactions.findIndex(
      r => r.generationId === args.generationId
    );
    const updatedReactions = [...session.reactions];
    if (existingIdx >= 0) {
      updatedReactions[existingIdx] = {
        generationId: args.generationId,
        reaction: args.reaction,
      };
    } else {
      updatedReactions.push({
        generationId: args.generationId,
        reaction: args.reaction,
      });
    }

    // Update liked/disliked prompt sliding windows
    const previousReaction =
      existingIdx >= 0 ? session.reactions[existingIdx]?.reaction : undefined;
    let { likedPrompts, dislikedPrompts } = session;

    if (args.reaction === "liked" && previousReaction !== "liked") {
      likedPrompts = [
        ...likedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        args.prompt,
      ];
      dislikedPrompts = dislikedPrompts.filter(p => p !== args.prompt);
    } else if (
      args.reaction === "disliked" &&
      previousReaction !== "disliked"
    ) {
      dislikedPrompts = [
        ...dislikedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        args.prompt,
      ];
      likedPrompts = likedPrompts.filter(p => p !== args.prompt);
    } else if (args.reaction === "saved") {
      // Saved is a positive signal — keep in liked if present, remove from disliked
      dislikedPrompts = dislikedPrompts.filter(p => p !== args.prompt);
    }

    await ctx.db.patch(session._id, {
      reactions: updatedReactions,
      likedPrompts,
      dislikedPrompts,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Pause a session (on exit via Escape). Keeps all generations visible.
 */
export const pause = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      return;
    }

    await ctx.db.patch(session._id, {
      status: "paused",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark a session as completed (explicit "End Session").
 */
export const complete = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      return;
    }

    await ctx.db.patch(session._id, {
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Remove a session. Archives non-saved generations.
 */
export const remove = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.userId !== userId) {
      return;
    }

    // Get saved generation IDs
    const savedIds = new Set(
      session.reactions
        .filter(r => r.reaction === "saved")
        .map(r => r.generationId)
    );

    // Archive non-saved generations
    const generations = await ctx.db
      .query("generations")
      .withIndex("by_batch", q => q.eq("batchId", args.sessionId))
      .collect();

    for (const gen of generations) {
      if (!(savedIds.has(gen._id) || gen.isArchived)) {
        await ctx.db.patch(gen._id, { isArchived: true });
      }
    }

    // Delete the session doc
    await ctx.db.delete(session._id);
  },
});

// ============================================================================
// Internal mutations (called from actions)
// ============================================================================

/**
 * Increment the generation count on a session.
 * Called from the discovery action after creating a generation.
 */
export const internalIncrementGenerationCount = internalMutation({
  args: {
    sessionId: v.string(),
    modelId: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("discoverySessions")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      return;
    }

    const patch: Record<string, unknown> = {
      generationCount: session.generationCount + 1,
      updatedAt: Date.now(),
    };

    // Backfill modelId/aspectRatio from the first generation
    if (args.modelId && !session.modelId) {
      patch.modelId = args.modelId;
    }
    if (args.aspectRatio && !session.aspectRatio) {
      patch.aspectRatio = args.aspectRatio;
    }

    await ctx.db.patch(session._id, patch);
  },
});
