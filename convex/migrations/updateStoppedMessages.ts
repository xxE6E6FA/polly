import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

/**
 * Migration to update messages that were stopped by the user.
 * It converts the legacy `stopped: true` flag to `finishReason: "user_stopped"`.
 *
 * Strategy:
 * - Paginate through all messages.
 * - Check for `metadata.stopped === true`.
 * - Update `finishReason` and remove `stopped` flag.
 */
async function updateStoppedMessagesHandler(
  ctx: MutationCtx,
  args: {
    batchSize?: number;
    cursor?: string;
  },
) {
  const batchSize = args.batchSize ?? 100;

  // Paginate through all messages
  const messagesQuery = ctx.db.query("messages").order("desc");

  const { page: messages, continueCursor } = await messagesQuery.paginate({
    cursor: args.cursor ?? null,
    numItems: batchSize,
  });

  if (messages.length === 0) {
    return {
      updated: 0,
      hasMore: false,
      cursor: null,
    };
  }

  let updated = 0;

  for (const message of messages) {
    const metadata = message.metadata as Record<string, any> | undefined;
    
    // Check if message has the legacy stopped flag
    if (metadata?.stopped === true) {
      // Update finishReason and remove stopped flag
      const newMetadata = { ...metadata };
      newMetadata.finishReason = "user_stopped";
      delete newMetadata.stopped;

      await ctx.db.patch(message._id, {
        metadata: newMetadata,
      });
      updated++;
    }
  }

  return {
    updated,
    hasMore: continueCursor !== null,
    cursor: continueCursor,
  };
}

export const runBatch = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await updateStoppedMessagesHandler(ctx, {
      batchSize: args.batchSize,
      cursor: args.cursor,
    });

    return {
      updated: result.updated,
      hasMore: result.hasMore,
      cursor: result.cursor,
    };
  },
});

export const runMigration = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    totalUpdated: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "in_progress" | "complete";
    message: string;
    totalUpdated: number;
  }> => {
    const totalUpdated = args.totalUpdated ?? 0;

    const result = await ctx.runMutation(
      internal.migrations.updateStoppedMessages.runBatch,
      {
        batchSize: args.batchSize,
        cursor: args.cursor,
      },
    );

    const newTotalUpdated = totalUpdated + result.updated;

    console.log(
      `Migration progress: ${newTotalUpdated} messages updated`,
    );

    if (result.hasMore && result.cursor) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.updateStoppedMessages.runMigration,
        {
          batchSize: args.batchSize,
          cursor: result.cursor,
          totalUpdated: newTotalUpdated,
        },
      );

      return {
        status: "in_progress",
        message: `Processed batch: ${result.updated} updated. Total so far: ${newTotalUpdated}. Scheduling next batch...`,
        totalUpdated: newTotalUpdated,
      };
    }

    return {
      status: "complete",
      message: `Migration complete! Total: ${newTotalUpdated} messages updated.`,
      totalUpdated: newTotalUpdated,
    };
  },
});
