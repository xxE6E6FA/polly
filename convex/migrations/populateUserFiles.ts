import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  mutation,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";

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

          // Check if entry already exists to avoid duplicates
          const existing = await ctx.db
            .query("userFiles")
            .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
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
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      processedMessages: result.page.length,
      errors,
    };
  },
});

/**
 * Alias for consistency with other migrations
 * Note: This runs a SINGLE batch only. Use the script to run all batches.
 */
export const runMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Run just one batch
    const result = await ctx.runMutation(populateUserFilesBatch as any, {
      batchSize: 10,
    });

    return {
      success: result.errors.length === 0,
      message: `Single batch: Created ${result.created}, skipped ${result.skipped}`,
      ...result,
      warning: result.isDone
        ? "Migration complete!"
        : "More batches needed - use the full migration script",
    };
  },
});
