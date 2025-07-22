import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

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

export const createAnonymous = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();

    return await ctx.db.insert("users", {
      isAnonymous: true,
      createdAt: now,
      messagesSent: 0,
      monthlyMessagesSent: 0,
      conversationCount: 0,
      totalMessageCount: 0,
    });
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
      console.error("[Users] Failed to graduate anonymous user:", error);
      throw new Error("Failed to graduate anonymous user");
    }
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
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
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
