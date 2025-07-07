import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAuth } from "./lib/auth";

// Export conversation type definition
export type ExportConversation = {
  conversation: {
    title: string;
    createdAt: number;
    updatedAt: number;
    isArchived: boolean | undefined;
    isPinned: boolean | undefined;
  };
  messages: Array<{
    role: "user" | "assistant" | "system" | "context";
    content: string;
    createdAt: number;
    model: string | undefined;
    provider: string | undefined;
    reasoning: string | undefined;
    attachments:
      | Array<{
          type: "image" | "pdf" | "text";
          url: string;
          name: string;
          size: number;
          content?: string;
          thumbnail?: string;
        }>
      | undefined;
    citations:
      | Array<{
          title: string;
          url: string;
          text: string;
          author?: string;
          publishedDate?: string;
        }>
      | undefined;
  }>;
};

// Job categories for organization
export const JOB_CATEGORIES = {
  DATA_TRANSFER: "data_transfer",
  BULK_OPERATIONS: "bulk_operations",
  AI_PROCESSING: "ai_processing",
  MAINTENANCE: "maintenance",
} as const;

// Job types
export const JOB_TYPES = {
  EXPORT: "export",
  IMPORT: "import",
  BULK_ARCHIVE: "bulk_archive",
  BULK_DELETE: "bulk_delete",
  CONVERSATION_SUMMARY: "conversation_summary",
  DATA_MIGRATION: "data_migration",
  MODEL_MIGRATION: "model_migration",
  BACKUP: "backup",
} as const;

// Job priorities
export const JOB_PRIORITIES = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;

// Export manifest schema for lightweight storage
const exportManifestSchema = v.object({
  totalConversations: v.number(),
  totalMessages: v.number(),
  conversationDateRange: v.object({
    earliest: v.number(),
    latest: v.number(),
  }),
  conversationTitles: v.array(v.string()),
  includeAttachments: v.boolean(),
  fileSizeBytes: v.optional(v.number()),
  version: v.string(),
});

// Create a new background job with enhanced metadata
export const create = mutation({
  args: {
    jobId: v.string(),
    userId: v.id("users"),
    type: v.union(
      v.literal("export"),
      v.literal("import"),
      v.literal("bulk_archive"),
      v.literal("bulk_delete"),
      v.literal("conversation_summary"),
      v.literal("data_migration"),
      v.literal("model_migration"),
      v.literal("backup")
    ),
    category: v.optional(
      v.union(
        v.literal("data_transfer"),
        v.literal("bulk_operations"),
        v.literal("ai_processing"),
        v.literal("maintenance")
      )
    ),
    totalItems: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    payload: v.optional(v.any()),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("normal"),
        v.literal("high"),
        v.literal("urgent")
      )
    ),
    // Import/Export specific fields
    conversationIds: v.optional(v.array(v.id("conversations"))),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Auto-assign category based on type if not provided
    let category = args.category;
    if (!category) {
      if (args.type === "export" || args.type === "import") {
        category = "data_transfer";
      } else if (args.type === "bulk_archive" || args.type === "bulk_delete") {
        category = "bulk_operations";
      } else if (
        args.type === "conversation_summary" ||
        args.type === "model_migration"
      ) {
        category = "ai_processing";
      } else {
        category = "maintenance";
      }
    }

    const jobId = await ctx.db.insert("backgroundJobs", {
      jobId: args.jobId,
      userId: args.userId,
      type: args.type,
      category,
      status: "scheduled",
      totalItems: args.totalItems,
      processedItems: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: args.title,
      description: args.description,
      payload: args.payload,
      priority: args.priority || "normal",
      retryCount: 0,
      maxRetries: 3,
      conversationIds: args.conversationIds,
      includeAttachments: args.includeAttachments,
    });

    return jobId;
  },
});

// Update job status
export const updateStatus = mutation({
  args: {
    jobId: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    const updates: {
      status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
      error?: string;
      updatedAt: number;
      startedAt?: number;
      completedAt?: number;
    } = {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    };

    if (args.status === "processing" && !job.startedAt) {
      updates.startedAt = Date.now();
    }

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(job._id, updates);
  },
});

// Update job progress
export const updateProgress = mutation({
  args: {
    jobId: v.string(),
    processedItems: v.number(),
    totalItems: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    await ctx.db.patch(job._id, {
      processedItems: args.processedItems,
      totalItems: args.totalItems,
      updatedAt: Date.now(),
    });
  },
});

// Save export result with manifest and file reference
export const saveExportResult = mutation({
  args: {
    jobId: v.string(),
    manifest: exportManifestSchema,
    fileStorageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    await ctx.db.patch(job._id, {
      manifest: args.manifest,
      fileStorageId: args.fileStorageId,
      status: args.status,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Save generic job result
export const saveResult = mutation({
  args: {
    jobId: v.string(),
    result: v.any(),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    await ctx.db.patch(job._id, {
      result: args.result,
      status: args.status,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Save import result
export const saveImportResult = mutation({
  args: {
    jobId: v.string(),
    result: v.object({
      totalImported: v.number(),
      totalProcessed: v.number(),
      errors: v.array(v.string()),
      conversationIds: v.optional(v.array(v.string())),
    }),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    await ctx.db.patch(job._id, {
      result: args.result,
      status: args.status,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Get job status
export const getStatus = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    return {
      jobId: job.jobId,
      type: job.type,
      category: job.category,
      status: job.status,
      processedItems: job.processedItems,
      totalItems: job.totalItems,
      progress:
        job.totalItems > 0
          ? Math.round((job.processedItems / job.totalItems) * 100)
          : 0,
      error: job.error,
      title: job.title,
      description: job.description,
      priority: job.priority,
      includeAttachments: job.includeAttachments,
      manifest: job.manifest,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  },
});

// Get download URL for export files
export const getExportDownloadUrl = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    if (job.status !== "completed" || !job.fileStorageId) {
      return null;
    }

    const downloadUrl = await ctx.storage.getUrl(job.fileStorageId);

    return {
      downloadUrl,
      manifest: job.manifest,
    };
  },
});

// Get import/export result
export const getResult = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    if (job.status !== "completed") {
      return null;
    }

    if (job.type === "export") {
      return {
        manifest: job.manifest,
        hasFile: !!job.fileStorageId,
      };
    }

    return job.result;
  },
});

// List user's background jobs
export const listUserJobs = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(
      v.union(
        v.literal("export"),
        v.literal("import"),
        v.literal("bulk_archive"),
        v.literal("bulk_delete"),
        v.literal("conversation_summary"),
        v.literal("data_migration"),
        v.literal("model_migration"),
        v.literal("backup")
      )
    ),
    category: v.optional(
      v.union(
        v.literal("data_transfer"),
        v.literal("bulk_operations"),
        v.literal("ai_processing"),
        v.literal("maintenance")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = args.limit || 50;

    let query = ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("userId"), userId))
      .order("desc");

    if (args.type) {
      query = query.filter(q => q.eq(q.field("type"), args.type));
    }

    if (args.category) {
      query = query.filter(q => q.eq(q.field("category"), args.category));
    }

    if (args.status) {
      query = query.filter(q => q.eq(q.field("status"), args.status));
    }

    const jobs = await query.take(limit);

    return jobs.map(job => ({
      jobId: job.jobId,
      type: job.type,
      category: job.category,
      status: job.status,
      processedItems: job.processedItems,
      totalItems: job.totalItems,
      progress:
        job.totalItems > 0
          ? Math.round((job.processedItems / job.totalItems) * 100)
          : 0,
      error: job.error,
      title: job.title,
      description: job.description,
      priority: job.priority,
      includeAttachments: job.includeAttachments,
      manifest: job.manifest,
      hasFile: !!job.fileStorageId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));
  },
});

// Delete a specific job and its file
export const deleteJob = mutation({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      throw new ConvexError("Background job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    if (job.fileStorageId) {
      try {
        await ctx.storage.delete(job.fileStorageId);
      } catch (error) {
        console.warn(`Failed to delete file ${job.fileStorageId}:`, error);
      }
    }

    await ctx.db.delete(job._id);
    return { success: true };
  },
});

// Clean up old completed jobs and their associated files
export const cleanupOldJobs = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
    category: v.optional(
      v.union(
        v.literal("data_transfer"),
        v.literal("bulk_operations"),
        v.literal("ai_processing"),
        v.literal("maintenance")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const daysOld = args.olderThanDays || 30;
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed"),
            q.eq(q.field("status"), "cancelled")
          ),
          q.lt(q.field("updatedAt"), cutoffTime)
        )
      );

    if (args.category) {
      query = query.filter(q => q.eq(q.field("category"), args.category));
    }

    const oldJobs = await query.collect();

    let deletedCount = 0;
    let filesDeleted = 0;

    for (const job of oldJobs) {
      // Delete associated file from storage if it exists
      if (job.fileStorageId) {
        try {
          await ctx.storage.delete(job.fileStorageId);
          filesDeleted++;
        } catch (error) {
          console.warn(`Failed to delete file ${job.fileStorageId}:`, error);
        }
      }

      await ctx.db.delete(job._id);
      deletedCount++;
    }

    return { deletedCount, filesDeleted };
  },
});

// Get active jobs count by category
export const getActiveJobsCount = query({
  args: {
    category: v.optional(
      v.union(
        v.literal("data_transfer"),
        v.literal("bulk_operations"),
        v.literal("ai_processing"),
        v.literal("maintenance")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    let query = ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.or(
            q.eq(q.field("status"), "scheduled"),
            q.eq(q.field("status"), "processing")
          )
        )
      );

    if (args.category) {
      query = query.filter(q => q.eq(q.field("category"), args.category));
    }

    const activeJobs = await query.collect();
    return activeJobs.length;
  },
});

// Clean up old completed jobs for all users (used by cron job)
export const cleanupOldJobsForAllUsers = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysOld = args.olderThanDays || 30;
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    // Find all old completed/failed/cancelled jobs across all users
    const oldJobs = await ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed"),
            q.eq(q.field("status"), "cancelled")
          ),
          q.lt(q.field("updatedAt"), cutoffTime)
        )
      )
      .collect();

    let deletedCount = 0;
    let filesDeleted = 0;

    for (const job of oldJobs) {
      // Delete associated file from storage if it exists
      if (job.fileStorageId) {
        try {
          await ctx.storage.delete(job.fileStorageId);
          filesDeleted++;
        } catch (error) {
          console.warn(`Failed to delete file ${job.fileStorageId}:`, error);
        }
      }

      await ctx.db.delete(job._id);
      deletedCount++;
    }

    return { deletedCount, filesDeleted };
  },
});

// Legacy field mapping helpers for backwards compatibility
export const LEGACY_FIELD_MAPPING = {
  exportId: "jobId",
  totalConversations: "totalItems",
  processed: "processedItems",
} as const;

// Internal function to get export data for conversations
export const getExportData = internalQuery({
  args: {
    conversationIds: v.array(v.id("conversations")),
    userId: v.id("users"),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ExportConversation[]> => {
    const conversations = await Promise.all(
      args.conversationIds.map(async conversationId => {
        const conversation = await ctx.db.get(conversationId);
        if (!conversation || conversation.userId !== args.userId) {
          return null;
        }

        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversationId)
          )
          .filter(q => q.eq(q.field("isMainBranch"), true))
          .order("asc")
          .collect();

        return {
          conversation: {
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            isArchived: conversation.isArchived,
            isPinned: conversation.isPinned,
          },
          messages: messages.map(message => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            model: message.model,
            provider: message.provider,
            reasoning: message.reasoning,
            attachments: args.includeAttachments
              ? message.attachments
              : undefined,
            citations: message.citations,
          })),
        } as ExportConversation;
      })
    );

    return conversations.filter(conv => conv !== null) as ExportConversation[];
  },
});

// Function to create Convex export data structure
export const createConvexExportData = (
  conversations: ExportConversation[],
  includeAttachments: boolean
) => {
  const manifest = {
    totalConversations: conversations.length,
    totalMessages: conversations.reduce(
      (sum, conv) => sum + conv.messages.length,
      0
    ),
    conversationDateRange:
      conversations.length > 0
        ? {
            earliest: Math.min(
              ...conversations.map(c => c.conversation.createdAt)
            ),
            latest: Math.max(
              ...conversations.map(c => c.conversation.updatedAt)
            ),
          }
        : { earliest: Date.now(), latest: Date.now() },
    conversationTitles: conversations
      .slice(0, 10)
      .map(c => c.conversation.title),
    includeAttachments,
    version: "1.0.0",
  };

  return {
    source: "Polly",
    version: "1.0.0",
    exportedAt: Date.now(),
    manifest,
    conversations: conversations.map(conv => ({
      title: conv.conversation.title,
      createdAt: conv.conversation.createdAt,
      updatedAt: conv.conversation.updatedAt,
      isArchived: conv.conversation.isArchived,
      isPinned: conv.conversation.isPinned,
      messages: conv.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        model: msg.model,
        provider: msg.provider,
        reasoning: msg.reasoning,
        attachments: includeAttachments ? msg.attachments : undefined,
        citations: msg.citations,
      })),
    })),
  };
};
