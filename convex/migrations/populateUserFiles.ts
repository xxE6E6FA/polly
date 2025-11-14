import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  mutation,
  internalMutation,
  internalAction,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Helper function containing the core migration logic
 * This is shared between the public mutation and internal mutation
 */
async function populateUserFilesHelper(
  ctx: MutationCtx,
  args: {
    cursor?: string;
    batchSize?: number;
  },
) {
  const batchSize = args.batchSize ?? 10;

  // Use paginated query to avoid reading too much data
  const result = await ctx.db
    .query("messages")
    .order("desc")
    .paginate({ numItems: batchSize, cursor: args.cursor ?? null });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const message of result.page) {
    // Skip messages without attachments
    if (!message.attachments || message.attachments.length === 0) {
      skipped++;
      continue;
    }

    // Get userId from message (should exist after first migration)
    if (!message.userId) {
      errors.push(
        `Message ${message._id} missing userId - run addUserIdToMessages migration first`,
      );
      continue;
    }

    for (const attachment of message.attachments) {
      try {
        // Only create userFiles entries for attachments with storageId
        if (!attachment.storageId) {
          skipped++;
          continue;
        }

        const storageId = attachment.storageId;

        // Check if entry already exists to avoid duplicates (using new compound index)
        const existing = await ctx.db
          .query("userFiles")
          .withIndex("by_message", q => q.eq("messageId", message._id))
          .filter(q => q.eq(q.field("storageId"), storageId))
          .unique();

        if (existing) {
          skipped++;
          continue;
        }

        // Create userFiles entry
        await ctx.db.insert("userFiles", {
          userId: message.userId,
          storageId,
          messageId: message._id,
          conversationId: message.conversationId,
          type: attachment.type,
          isGenerated: attachment.generatedImage?.isGenerated ?? false,
          name: attachment.name,
          size: attachment.size,
          mimeType: attachment.mimeType,
          createdAt: message.createdAt ?? message._creationTime,
        });
        created++;
      } catch (error) {
        errors.push(
          `Failed to create userFile for attachment in message ${message._id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return {
    created,
    skipped,
    hasMore: !result.isDone,
    cursor: result.continueCursor,
    processedMessages: result.page.length,
    errors,
  };
}

/**
 * Migration to populate userFiles table from existing message attachments
 * This creates userFiles entries for all attachments in messages
 *
 * Uses pagination to handle large datasets without hitting Convex limits
 */
export const populateUserFilesBatch = mutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await populateUserFilesHelper(ctx, args);
  },
});

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
    const result = await populateUserFilesHelper(ctx, {
      batchSize: args.batchSize ?? 10,
      cursor: args.cursor,
    });

    return {
      created: result.created,
      skipped: result.skipped,
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
 *   npx convex run migrations/populateUserFiles:runMigration
 *
 * The migration will continue until all messages with attachments are processed.
 * You can monitor progress in the Convex dashboard logs.
 */
export const runMigration = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    totalCreated: v.optional(v.number()),
    totalSkipped: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "in_progress" | "complete";
    message: string;
    totalCreated: number;
    totalSkipped: number;
  }> => {
    const totalCreated = args.totalCreated ?? 0;
    const totalSkipped = args.totalSkipped ?? 0;

    // Run one batch
    const result: {
      created: number;
      skipped: number;
      hasMore: boolean;
      cursor: string | null;
      errors: string[];
    } = await ctx.runMutation(
      internal.migrations.populateUserFiles.runBatch,
      {
        batchSize: args.batchSize,
        cursor: args.cursor,
      },
    );

    const newTotalCreated = totalCreated + result.created;
    const newTotalSkipped = totalSkipped + result.skipped;

    console.log(
      `Migration progress: ${newTotalCreated} userFiles created, ${newTotalSkipped} skipped`,
    );

    // If there's more work, schedule the next batch
    if (result.hasMore && result.cursor) {
      await ctx.scheduler.runAfter(
        0, // Run immediately
        internal.migrations.populateUserFiles.runMigration,
        {
          batchSize: args.batchSize,
          cursor: result.cursor,
          totalCreated: newTotalCreated,
          totalSkipped: newTotalSkipped,
        },
      );

      return {
        status: "in_progress",
        message: `Processed batch: ${result.created} created, ${result.skipped} skipped. Total so far: ${newTotalCreated} created, ${newTotalSkipped} skipped. Scheduling next batch...`,
        totalCreated: newTotalCreated,
        totalSkipped: newTotalSkipped,
      };
    }

    // Migration complete!
    return {
      status: "complete",
      message: `Migration complete! Total: ${newTotalCreated} userFiles created, ${newTotalSkipped} skipped.`,
      totalCreated: newTotalCreated,
      totalSkipped: newTotalSkipped,
    };
  },
});
