import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { withRetry } from "./ai/error_handlers";
import { log } from "./lib/logger";

// Shared handler for creating anonymous users
async function handleCreateAnonymousUser(ctx: MutationCtx) {
  const now = Date.now();

  return await ctx.db.insert("users", {
    isAnonymous: true,
    createdAt: now,
    messagesSent: 0,
    monthlyMessagesSent: 0,
    conversationCount: 0,
    totalMessageCount: 0,
  });
}

// Shared handler for getting user by ID
async function handleGetUserById(ctx: QueryCtx, id: Id<"users">) {
  return await ctx.db.get(id);
}

export const current = query({
  args: {},
  handler: async ctx => {
    // First try to get the authenticated user ID (works for both anonymous and regular users)
    const userId = await getAuthUserId(ctx);

    if (userId) {
      return await ctx.db.get(userId);
    }

    // If no authenticated user, return null
    // Don't try to find anonymous users without auth - this creates inconsistent state
    return null;
  },
});

// Internal version for system operations
export const internalCreateAnonymous = internalMutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

export const createAnonymous = mutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

/**
 * Increment user message statistics
 */
export const incrementMessage = mutation({
  args: {
    userId: v.id("users"),
    model: v.string(),
    provider: v.string(),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withRetry(
      async () => {
        const fresh = await ctx.db.get(args.userId);
        if (!fresh) {
          throw new Error("User not found");
        }

        const updates: {
          messagesSent: number;
          monthlyMessagesSent: number;
          totalMessageCount: number;
        } = {
          messagesSent: (fresh.messagesSent || 0) + 1,
          monthlyMessagesSent: (fresh.monthlyMessagesSent || 0) + 1,
          totalMessageCount: (fresh.totalMessageCount || 0) + 1,
        };

        await ctx.db.patch(args.userId, updates);
      },
      5,
      25
    );
  },
});

export const graduateAnonymousUser = mutation({
  args: {
    anonymousUserId: v.id("users"),
    newUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { anonymousUserId, newUserId } = args;

    // Get both users
    const anonymousUser = await ctx.db.get(anonymousUserId);
    const newUser = await ctx.db.get(newUserId);

    if (!(anonymousUser && newUser)) {
      throw new Error("One or both users not found");
    }

    if (!anonymousUser.isAnonymous) {
      throw new Error("Source user is not anonymous");
    }

    try {
      // Transfer conversations from anonymous user to new user
      const anonymousConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", anonymousUserId))
        .collect();

      for (const conversation of anonymousConversations) {
        await ctx.db.patch(conversation._id, {
          userId: newUserId,
        });
      }

      // Update the new user with anonymous user's message counts
      const updatedMonthlyMessagesSent =
        (newUser.monthlyMessagesSent || 0) +
        (anonymousUser.monthlyMessagesSent || 0);
      const updatedTotalMessageCount =
        (newUser.totalMessageCount || 0) +
        (anonymousUser.totalMessageCount || 0);
      const updatedConversationCount = Math.max(
        0,
        (newUser.conversationCount || 0) +
          (anonymousUser.conversationCount || 0)
      );

      await ctx.db.patch(newUserId, {
        monthlyMessagesSent: Math.max(0, updatedMonthlyMessagesSent),
        totalMessageCount: Math.max(0, updatedTotalMessageCount),
        conversationCount: updatedConversationCount,
      });

      // Delete the anonymous user
      await ctx.db.delete(anonymousUserId);

      return {
        success: true,
        conversationsTransferred: anonymousConversations.length,
        messagesTransferred: anonymousUser.totalMessageCount || 0,
      };
    } catch (error) {
      log.error("Failed to graduate anonymous user:", error);
      throw new Error("Failed to graduate anonymous user");
    }
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export const patch = mutation({
  args: {
    id: v.id("users"),
    updates: v.any(),
  },
  handler: (ctx, args) => {
    const patch: Record<string, unknown> = { ...args.updates };
    return ctx.db.patch(args.id, patch);
  },
});

export const internalGetById = internalQuery({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export const getMessageSentCount = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return {
      messagesSent: user.messagesSent,
      monthlyMessagesSent: user.monthlyMessagesSent,
    };
  },
});
