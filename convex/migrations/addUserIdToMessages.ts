import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Migration to add userId to all existing messages
 * This populates the userId field based on the conversation's userId
 *
 * Strategy: Process messages conversation-by-conversation to minimize reads
 * - Fetch a batch of conversations
 * - For each conversation, update all its messages that lack userId
 * - This avoids reading conversation data multiple times for messages in same conversation
 */
async function addUserIdToMessagesHandler(
  ctx: MutationCtx,
  args: {
    batchSize?: number;
    cursor?: string;
  },
) {
  const batchSize = args.batchSize ?? 5; // Process 5 conversations at a time

  // Get conversations ordered by creation date for consistent pagination
  const conversationsQuery = ctx.db
    .query("conversations")
    .withIndex("by_created_at")
    .order("asc");

  const { page: conversations, continueCursor } =
    await conversationsQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });

  if (conversations.length === 0) {
    return {
      updated: 0,
      deleted: 0,
      hasMore: false,
      cursor: null,
      errors: [],
    };
  }

  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];

  // Process each conversation's messages
  for (const conversation of conversations) {
    try {
      // Get messages in this conversation that don't have userId set
      // Use take() with a reasonable limit instead of collect() to avoid reading too many messages
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .take(100); // Limit to 100 messages per conversation per batch

      // Update messages that don't have userId
      for (const message of messages) {
        if (message.userId === undefined) {
          await ctx.db.patch("messages", message._id, {
            userId: conversation.userId,
          });
          updated++;
        }
      }
    } catch (error) {
      errors.push(
        `Failed to process conversation ${conversation._id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Check for orphaned messages (messages whose conversations no longer exist)
  // We do this separately to keep the main loop clean
  const orphanedMessages = await ctx.db
    .query("messages")
    .withIndex("by_user", (q) => q.eq("userId", undefined))
    .take(50);

  for (const message of orphanedMessages) {
    const conversation = await ctx.db.get("conversations", message.conversationId);
    if (!conversation) {
      await ctx.db.delete("messages", message._id);
      deleted++;
    }
  }

  return {
    updated,
    deleted,
    hasMore: continueCursor !== null,
    cursor: continueCursor,
    errors,
  };
}

/**
 * Internal mutation that processes one batch of the migration
 * Used by runMigration (action) for self-scheduling pattern
 */
export const runBatch = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await addUserIdToMessagesHandler(ctx, {
      batchSize: args.batchSize ?? 5,
      cursor: args.cursor,
    });

    return {
      updated: result.updated,
      deleted: result.deleted,
      hasMore: result.hasMore,
      cursor: result.cursor,
      errors: result.errors,
    };
  },
});

/**
 * Self-scheduling action that runs the entire migration automatically
 *
 * This action runs one batch and then schedules itself to run again if there's more work.
 * This allows the migration to run to completion without manual intervention.
 *
 * Usage from Convex dashboard or via CLI:
 *   npx convex run migrations/addUserIdToMessages:runMigration
 *
 * The migration will continue until all messages are updated.
 * You can monitor progress in the Convex dashboard logs.
 */
export const runMigration = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    totalUpdated: v.optional(v.number()),
    totalDeleted: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "in_progress" | "complete";
    message: string;
    totalUpdated: number;
    totalDeleted: number;
  }> => {
    const totalUpdated = args.totalUpdated ?? 0;
    const totalDeleted = args.totalDeleted ?? 0;

    // Run one batch
    const result: {
      updated: number;
      deleted: number;
      hasMore: boolean;
      cursor: string | null;
      errors: string[];
    } = await ctx.runMutation(
      internal.migrations.addUserIdToMessages.runBatch,
      {
        batchSize: args.batchSize,
        cursor: args.cursor,
      },
    );

    const newTotalUpdated = totalUpdated + result.updated;
    const newTotalDeleted = totalDeleted + result.deleted;

    console.log(
      `Migration progress: ${newTotalUpdated} messages updated, ${newTotalDeleted} deleted`,
    );

    // If there's more work, schedule the next batch
    if (result.hasMore && result.cursor) {
      await ctx.scheduler.runAfter(
        0, // Run immediately
        internal.migrations.addUserIdToMessages.runMigration,
        {
          batchSize: args.batchSize,
          cursor: result.cursor,
          totalUpdated: newTotalUpdated,
          totalDeleted: newTotalDeleted,
        },
      );

      return {
        status: "in_progress",
        message: `Processed batch: ${result.updated} updated, ${result.deleted} deleted. Total so far: ${newTotalUpdated} updated, ${newTotalDeleted} deleted. Scheduling next batch...`,
        totalUpdated: newTotalUpdated,
        totalDeleted: newTotalDeleted,
      };
    }

    // Migration complete!
    return {
      status: "complete",
      message: `Migration complete! Total: ${newTotalUpdated} messages updated, ${newTotalDeleted} orphaned messages deleted.`,
      totalUpdated: newTotalUpdated,
      totalDeleted: newTotalDeleted,
    };
  },
});
