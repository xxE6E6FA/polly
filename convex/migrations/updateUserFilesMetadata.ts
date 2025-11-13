import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";

/**
 * Migration to update userFiles table with full attachment metadata
 * This copies missing fields from messages.attachments to userFiles
 *
 * Run this after expanding the userFiles schema to include all attachment fields
 */
export const updateUserFilesMetadataBatch = mutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 10;

    // Use paginated query to avoid reading too much data
    const result = await ctx.db
      .query("userFiles")
      .order("desc")
      .paginate({ numItems: batchSize, cursor: args.cursor ?? null });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userFile of result.page) {
      try {
        // Get the message to find the full attachment data
        const message = await ctx.db.get(userFile.messageId);
        if (!message) {
          errors.push(`Message ${userFile.messageId} not found for userFile ${userFile._id}`);
          continue;
        }

        // Find the matching attachment in the message
        const attachment = message.attachments?.find(
          att => att.storageId === userFile.storageId
        );

        if (!attachment) {
          // No attachment found - might have been deleted from message
          skipped++;
          continue;
        }

        // Check if metadata is already present (skip if already migrated)
        if (
          userFile.url !== undefined ||
          userFile.content !== undefined ||
          userFile.thumbnail !== undefined ||
          userFile.textFileId !== undefined
        ) {
          skipped++;
          continue;
        }

        // Update userFile with full metadata
        await ctx.db.patch(userFile._id, {
          url: attachment.url,
          content: attachment.content,
          thumbnail: attachment.thumbnail,
          textFileId: attachment.textFileId,
          extractedText: attachment.extractedText,
          extractionError: attachment.extractionError,
          generatedImageSource: attachment.generatedImage?.source,
          generatedImageModel: attachment.generatedImage?.model,
          generatedImagePrompt: attachment.generatedImage?.prompt,
        });

        updated++;
      } catch (error) {
        errors.push(
          `Failed to update userFile ${userFile._id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      updated,
      skipped,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      processedFiles: result.page.length,
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
    const result = await ctx.runMutation(updateUserFilesMetadataBatch as any, {
      batchSize: 10,
    });

    return {
      success: result.errors.length === 0,
      message: `Single batch: Updated ${result.updated}, skipped ${result.skipped}`,
      ...result,
      warning: result.isDone
        ? "Migration complete!"
        : "More batches needed - use the full migration script",
    };
  },
});
