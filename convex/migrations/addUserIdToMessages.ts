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
  const batchSize = args.batchSize ?? 100;

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
 * Run the full migration (all batches)
 */
export const runMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalUpdated = 0;
    let totalDeleted = 0;
    const allErrors: string[] = [];
    let hasMore = true;

    while (hasMore) {
      const result = await addUserIdToMessagesHandler(ctx, { batchSize: 100 });
      totalUpdated += result.updated;
      totalDeleted += result.deleted;
      allErrors.push(...result.errors);
      hasMore = result.hasMore;
    }

    return {
      success: allErrors.length === 0,
      message: `Updated ${totalUpdated} messages, deleted ${totalDeleted} orphaned messages`,
      updated: totalUpdated,
      deleted: totalDeleted,
      errors: allErrors,
    };
  },
});
