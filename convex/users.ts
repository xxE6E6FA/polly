import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId } from "./lib/auth";

export const current = query({
  args: {},
  handler: async ctx => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
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

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
