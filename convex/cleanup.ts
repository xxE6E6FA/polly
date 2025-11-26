import { SHARED_CONVERSATION_EXPIRY_DAYS } from "@shared/constants";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

export const archiveOldConversations = internalMutation({
  args: {
    daysOld: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysOld = args.daysOld || 90;
    const batchSize = args.batchSize || 100;
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const oldConversations = await ctx.db
      .query("conversations")
      .filter(q =>
        q.and(
          q.lt(q.field("updatedAt"), cutoffDate),
          q.neq(q.field("isArchived"), true),
          q.neq(q.field("isPinned"), true)
        )
      )
      .take(batchSize);

    const archiveOperations = oldConversations.map(conv =>
      ctx.db.patch(conv._id, {
        isArchived: true,
        updatedAt: Date.now(),
      })
    );

    await Promise.all(archiveOperations);

    return {
      archivedCount: oldConversations.length,
      hasMore: oldConversations.length === batchSize,
    };
  },
});

export const cleanupOrphanedMessages = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    daysOld: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 100;
    const daysOld = args.daysOld || 7;
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_created_at", q => q.lt("createdAt", cutoffDate))
      .take(batchSize);

    const orphanedIds: Id<"messages">[] = [];

    const conversationIdGroups = new Map<string, typeof messages>();
    for (const message of messages) {
      const conversationId = message.conversationId;
      if (!conversationIdGroups.has(conversationId)) {
        conversationIdGroups.set(conversationId, []);
      }
      conversationIdGroups.get(conversationId)?.push(message);
    }

    for (const [conversationId, messagesGroup] of conversationIdGroups) {
      const conversation = await ctx.db.get(
        conversationId as Id<"conversations">
      );
      if (!conversation) {
        for (const msg of messagesGroup) {
          orphanedIds.push(msg._id as Id<"messages">);
        }
      }
    }

    if (orphanedIds.length > 0) {
      await ctx.runMutation(api.messages.removeMultiple, {
        ids: orphanedIds,
      });
    }

    return {
      cleanedCount: orphanedIds.length,
      hasMore: messages.length === batchSize,
      cutoffDate,
      daysOld,
    };
  },
});

export const archiveConversationsForUser = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 100;

    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();

    if (!userSettings?.autoArchiveEnabled) {
      return {
        archivedCount: 0,
        hasMore: false,
        reason: "auto-archive disabled",
      };
    }

    const daysOld = userSettings.autoArchiveDays ?? 30;
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const oldConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", args.userId))
      .filter(q =>
        q.and(
          q.lt(q.field("updatedAt"), cutoffDate),
          q.neq(q.field("isArchived"), true),
          q.neq(q.field("isPinned"), true)
        )
      )
      .take(batchSize);

    const archiveOperations = oldConversations.map(conv =>
      ctx.db.patch(conv._id, {
        isArchived: true,
        updatedAt: Date.now(),
      })
    );

    await Promise.all(archiveOperations);

    return {
      archivedCount: oldConversations.length,
      hasMore: oldConversations.length === batchSize,
      daysOld,
    };
  },
});

export const archiveConversationsForAllUsers = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 10;

    const usersWithAutoArchive = await ctx.db
      .query("userSettings")
      .withIndex("by_auto_archive_enabled", q =>
        q.eq("autoArchiveEnabled", true)
      )
      .take(batchSize);

    let totalArchived = 0;
    const results: Array<{
      userId: string;
      archivedCount: number;
      hasMore: boolean;
      reason?: string;
      daysOld?: number;
    }> = [];

    for (const userSettings of usersWithAutoArchive) {
      const daysOld = userSettings.autoArchiveDays ?? 30;
      const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;

      const oldConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", userSettings.userId))
        .filter(q =>
          q.and(
            q.lt(q.field("updatedAt"), cutoffDate),
            q.neq(q.field("isArchived"), true),
            q.neq(q.field("isPinned"), true)
          )
        )
        .take(100);

      const archiveOperations = oldConversations.map(conv =>
        ctx.db.patch(conv._id, {
          isArchived: true,
          updatedAt: Date.now(),
        })
      );

      await Promise.all(archiveOperations);

      const archivedCount = oldConversations.length;
      totalArchived += archivedCount;
      results.push({
        userId: userSettings.userId,
        archivedCount,
        hasMore: oldConversations.length === 100,
        daysOld,
      });
    }

    return {
      totalArchived,
      usersProcessed: usersWithAutoArchive.length,
      hasMore: usersWithAutoArchive.length === batchSize,
      results,
    };
  },
});

export const resetMonthlyUserStats = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 100;
    const now = Date.now();

    // Get users who need monthly reset
    const users = await ctx.db
      .query("users")
      .filter(q =>
        q.and(
          q.neq(q.field("isAnonymous"), true),
          q.neq(q.field("hasUnlimitedCalls"), true)
        )
      )
      .take(batchSize);

    let resetCount = 0;
    const results: Array<{
      userId: string;
      reset: boolean;
      reason?: string;
    }> = [];

    for (const user of users) {
      if (!user.createdAt) {
        results.push({
          userId: user._id,
          reset: false,
          reason: "no createdAt date",
        });
        continue;
      }

      const joinDate = new Date(user.createdAt);
      const joinDay = joinDate.getDate();
      const nowDate = new Date(now);

      // Calculate the last reset date for this user
      let lastResetDate = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        joinDay
      );

      // If the reset date for this month has already passed, move to previous month
      if (lastResetDate > nowDate) {
        lastResetDate = new Date(
          nowDate.getFullYear(),
          nowDate.getMonth() - 1,
          joinDay
        );
      }

      // Handle edge case where the join day doesn't exist in the target month (e.g., Jan 31 -> Feb 31)
      if (lastResetDate.getDate() !== joinDay) {
        lastResetDate = new Date(
          lastResetDate.getFullYear(),
          lastResetDate.getMonth() + 1,
          0
        ); // Last day of the month
      }

      // Check if we need to reset (if lastMonthlyReset is before the calculated last reset date)
      const needsReset =
        !user.lastMonthlyReset ||
        user.lastMonthlyReset < lastResetDate.getTime();

      if (needsReset) {
        await ctx.db.patch(user._id, {
          monthlyMessagesSent: 0,
          lastMonthlyReset: now,
        });
        resetCount++;
        results.push({
          userId: user._id,
          reset: true,
        });
      } else {
        results.push({
          userId: user._id,
          reset: false,
          reason: "no reset needed",
        });
      }
    }

    return {
      resetCount,
      usersProcessed: users.length,
      hasMore: users.length === batchSize,
      results,
    };
  },
});

export const cleanupOldSharedConversations = internalMutation({
  args: {
    daysOld: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysOld = args.daysOld || SHARED_CONVERSATION_EXPIRY_DAYS;
    const batchSize = args.batchSize || 100;
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const oldSharedConversations = await ctx.db
      .query("sharedConversations")
      .withIndex("by_last_updated", q => q.lt("lastUpdated", cutoffDate))
      .take(batchSize);

    let deletedCount = 0;
    for (const sharedConversation of oldSharedConversations) {
      await ctx.db.delete(sharedConversation._id);
      deletedCount++;
    }

    return {
      deletedCount,
      hasMore: oldSharedConversations.length === batchSize,
      cutoffDate,
      daysOld,
    };
  },
});
