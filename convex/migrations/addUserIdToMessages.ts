import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

/**
 * Migration to add userId to all existing messages
 * This populates the userId field based on the conversation's userId
 */
async function addUserIdToMessagesHandler(
  ctx: MutationCtx,
  args: {
    batchSize?: number;
  },
) {
  const batchSize = args.batchSize ?? 25;

  // Get all messages without userId
  const messages = await ctx.db
    .query("messages")
    .filter((q) => q.eq(q.field("userId"), undefined))
    .take(batchSize);

  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const message of messages) {
    try {
      const conversation = await ctx.db.get(message.conversationId);
      if (!conversation) {
        // Delete orphaned messages (messages without a conversation)
        await ctx.db.delete(message._id);
        deleted++;
        continue;
      }

      await ctx.db.patch(message._id, {
        userId: conversation.userId,
      });
      updated++;
    } catch (error) {
      errors.push(
        `Failed to update message ${message._id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    updated,
    deleted,
    hasMore: messages.length === batchSize,
    errors,
  };
}

export const addUserIdToMessages = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: addUserIdToMessagesHandler,
});

/**
 * Run one batch of the migration
 * Call this multiple times until hasMore is false to complete the migration
 *
 * This processes ONE batch per call to avoid exceeding Convex's 16MB read limit
 */
export const runMigration = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Use smaller default batch size to stay under bytes limit
    const result = await addUserIdToMessagesHandler(ctx, {
      batchSize: args.batchSize ?? 25
    });

    return {
      success: result.errors.length === 0,
      message: `Updated ${result.updated} messages, deleted ${result.deleted} orphaned messages${result.hasMore ? " (more batches remaining)" : " (migration complete)"}`,
      updated: result.updated,
      deleted: result.deleted,
      hasMore: result.hasMore,
      errors: result.errors,
    };
  },
});
