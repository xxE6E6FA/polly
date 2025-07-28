import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { ExportConversation } from "./backgroundJobs";
import { createConvexExportData } from "./backgroundJobs";

// Schedule a background export job
export const scheduleBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Generate export metadata
    const metadata = generateExportMetadata(
      args.conversationIds,
      args.includeAttachmentContent ?? false
    );

    // Create export job record with enhanced metadata
    await ctx.runMutation(internal.backgroundJobs.internalCreate, {
      jobId: args.jobId,
      userId,
      type: "export",
      totalItems: args.conversationIds.length,
      title: metadata.title,
      description: metadata.description,
      conversationIds: args.conversationIds,
      includeAttachments: args.includeAttachmentContent,
    });

    // Schedule the export processing
    await ctx.scheduler.runAfter(
      100,
      api.conversationExport.processBackgroundExport,
      {
        conversationIds: args.conversationIds,
        jobId: args.jobId,
        includeAttachments: args.includeAttachmentContent ?? false,
        userId,
      }
    );

    return { jobId: args.jobId, status: "scheduled" };
  },
});

// Process a scheduled export job
export const processBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
    includeAttachments: v.boolean(),
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; exportedCount: number }> => {
    try {
      // Update status to processing
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.jobId,
        status: "processing",
      });

      // Update initial progress
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: 0,
        totalItems: args.conversationIds.length,
      });

      // Get export data using internal query
      const exportData: ExportConversation[] = await ctx.runQuery(
        internal.backgroundJobs.getExportData,
        {
          conversationIds: args.conversationIds,
          userId: args.userId,
          includeAttachments: args.includeAttachments,
        }
      );

      if (exportData.length === 0) {
        throw new Error("No conversations found for export");
      }

      // Update progress after data retrieval
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: Math.floor(args.conversationIds.length * 0.5),
        totalItems: args.conversationIds.length,
      });

      // Create the export data structure using the regular function
      const convexExportData = createConvexExportData(
        exportData,
        args.includeAttachments
      );

      // Update progress before file creation
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: Math.floor(args.conversationIds.length * 0.8),
        totalItems: args.conversationIds.length,
      });

      // Convert to JSON string
      const exportJson = JSON.stringify(convexExportData, null, 2);

      // Store the export file
      const fileStorageId = await ctx.storage.store(
        new Blob([exportJson], { type: "application/json" })
      );

      // Update final progress
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: args.conversationIds.length,
        totalItems: args.conversationIds.length,
      });

      // Save the export result
      await ctx.runMutation(internal.backgroundJobs.internalSaveExportResult, {
        jobId: args.jobId,
        manifest: convexExportData.manifest,
        fileStorageId,
        status: "completed",
      });

      return { success: true, exportedCount: exportData.length };
    } catch (error) {
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

// Helper function to generate export metadata
function generateExportMetadata(
  conversationIds: string[],
  includeAttachments: boolean
) {
  const dateStr = new Date().toLocaleDateString();
  const count = conversationIds.length;
  const title =
    count === 1
      ? `Export Conversation - ${dateStr}`
      : `Export ${count} Conversations - ${dateStr}`;
  const description = `Export of ${count} conversation${
    count !== 1 ? "s" : ""
  } on ${dateStr}${includeAttachments ? " (with attachments)" : ""}`;

  return { title, description };
}
