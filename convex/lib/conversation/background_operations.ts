import { action } from "../../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "../../_generated/api";
import { v } from "convex/values";
import { scheduleRunAfter } from "../scheduler";

/**
 * Schedule a background import of conversations
 */
export const scheduleBackgroundImport = action({
  args: {
    conversations: v.array(v.any()),
    importId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Create import job record
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.importId,
      type: "import",
      totalItems: args.conversations.length,
      title: args.title,
      description: args.description,
    });

    // Schedule the import processing
    await scheduleRunAfter(ctx, 100, api.conversationImport.processImport, {
      conversations: args.conversations,
      importId: args.importId,
      skipDuplicates: true,
      userId,
    });

    return { importId: args.importId, status: "scheduled" };
  },
});

/**
 * Schedule a background bulk delete of conversations
 */
export const scheduleBackgroundBulkDelete = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Validate that user owns all conversations
    const conversations = await Promise.all(
      args.conversationIds.map(id =>
        ctx.runQuery(api.conversations.get, { id })
      )
    );

    const validConversations = conversations.filter(
      (conv: any) => conv && conv.userId === userId
    );
    if (validConversations.length !== args.conversationIds.length) {
      throw new Error("Some conversations not found or access denied");
    }

    // Generate metadata for the job
    const dateStr = new Date().toLocaleDateString();
    const count = args.conversationIds.length;
    const title =
      count === 1
        ? `Delete Conversation - ${dateStr}`
        : `Delete ${count} Conversations - ${dateStr}`;
    const description = `Background deletion of ${count} conversation${
      count !== 1 ? "s" : ""
    } on ${dateStr}`;

    // Create bulk delete job record
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.jobId,
      type: "bulk_delete",
      totalItems: args.conversationIds.length,
      title,
      description,
      conversationIds: args.conversationIds,
    });

    // Schedule the bulk delete processing
    await scheduleRunAfter(ctx, 100, api.conversations.processBulkDelete, {
      conversationIds: args.conversationIds,
      jobId: args.jobId,
      userId,
    });

    return { jobId: args.jobId, status: "scheduled" };
  },
});

/**
 * Process a scheduled bulk delete job
 */
export const processBulkDelete = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.jobId,
        status: "processing",
      });

      // Update initial progress
      await ctx.runMutation(api.backgroundJobs.updateProgress, {
        jobId: args.jobId,
        processedItems: 0,
        totalItems: args.conversationIds.length,
      });

      // Process conversations in batches
      const batchSize = 10;
      let totalDeleted = 0;
      const errors: string[] = [];

      for (let i = 0; i < args.conversationIds.length; i += batchSize) {
        const batch = args.conversationIds.slice(i, i + batchSize);

        try {
          const batchResult = await ctx.runMutation(
            internal.conversations.internalBulkRemove,
            {
              ids: batch,
              userId: args.userId,
            }
          );

          const deletedCount = batchResult.filter(
            (result: any) => result.status === "deleted"
          ).length;
          totalDeleted += deletedCount;
          errors.push(
            ...batchResult
              .filter((result: any) => result.status !== "deleted")
              .map((result: any) => `Failed to delete conversation ${result.id}`)
          );

          // Update progress based on batch progress
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.jobId,
            processedItems: i + batchSize,
            totalItems: args.conversationIds.length,
          });
        } catch (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error}`);

          // Still update progress even if batch failed
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.jobId,
            processedItems: i + batchSize,
            totalItems: args.conversationIds.length,
          });
        }
      }

      // Determine final status based on deletion results
      const allFailed = totalDeleted === 0 && args.conversationIds.length > 0;
      const partialSuccess =
        totalDeleted > 0 && totalDeleted < args.conversationIds.length;

      // Save final result (use internal mutation to include error message)
      await ctx.runMutation(internal.backgroundJobs.internalSaveImportResult, {
        jobId: args.jobId,
        result: {
          totalImported: totalDeleted,
          totalProcessed: args.conversationIds.length,
          errors,
        },
        status: allFailed ? "failed" : "completed",
        error: allFailed
          ? "No conversations were deleted. Please try again."
          : partialSuccess
            ? `Only ${totalDeleted} of ${args.conversationIds.length} conversations were deleted`
            : undefined,
      });

      return { success: !allFailed, totalDeleted };
    } catch (error) {
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});
