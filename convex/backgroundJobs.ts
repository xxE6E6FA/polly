import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { log } from "./lib/logger";

// Export conversation type definition
export type ExportAttachment = {
  type: "image" | "pdf" | "text";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  mimeType?: string;
  storageId?: Id<"_storage">;
  textFileId?: Id<"_storage">;
  extractedText?: string;
  generatedImage?: {
    isGenerated: boolean;
    source: string;
    model?: string;
    prompt?: string;
  };
};

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
    attachments?: ExportAttachment[];
    citations?:
      | Array<{
          title: string;
          url: string;
          text?: string;
          author?: string;
          publishedDate?: string;
          image?: string;
          description?: string;
          cited_text?: string;
          snippet?: string;
          favicon?: string;
          siteName?: string;
          type?: string;
        }>
      | undefined;
  }>;
};

import {
  backgroundJobManifestSchema,
  backgroundJobResultSchema,
} from "./lib/schemas";

// Shared type definitions for create job arguments
type CreateJobArgs = {
  jobId: string;
  type:
    | "export"
    | "import"
    | "bulk_archive"
    | "bulk_delete"
    | "conversation_summary"
    | "data_migration"
    | "model_migration"
    | "backup";
  category?:
    | "data_transfer"
    | "bulk_operations"
    | "ai_processing"
    | "maintenance";
  totalItems: number;
  title?: string;
  description?: string;
  payload?: unknown;
  priority?: "low" | "normal" | "high" | "urgent";
  conversationIds?: Id<"conversations">[];
  includeAttachments?: boolean;
};

// Shared handler function for creating background jobs
async function handleCreateBackgroundJob(
  ctx: MutationCtx,
  args: CreateJobArgs,
  userId: Id<"users">
) {
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
    userId,
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
}

// Shared handler function for updating job status
async function handleUpdateJobStatus(
  ctx: MutationCtx,
  args: {
    jobId: string;
    status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
    error?: string;
  }
) {
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
    updatedAt: Date.now(),
  };

  if (args.status === "processing" && !job.startedAt) {
    updates.startedAt = Date.now();
  }

  if (args.status === "completed" || args.status === "failed") {
    updates.completedAt = Date.now();
  }

  if (args.error) {
    updates.error = args.error;
  }

  await ctx.db.patch(job._id, updates);
}

// Shared handler function for updating job progress
async function handleUpdateJobProgress(
  ctx: MutationCtx,
  args: {
    jobId: string;
    processedItems: number;
    totalItems?: number;
  }
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter(q => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  const updates: {
    processedItems: number;
    updatedAt: number;
    totalItems?: number;
  } = {
    processedItems: args.processedItems,
    updatedAt: Date.now(),
  };

  if (args.totalItems !== undefined) {
    updates.totalItems = args.totalItems;
  }

  await ctx.db.patch(job._id, updates);
}

// Shared handler function for saving export result
async function handleSaveExportResult(
  ctx: MutationCtx,
  args: {
    jobId: string;
    manifest: Infer<typeof backgroundJobManifestSchema>;
    fileStorageId: Id<"_storage">;
    status: "completed" | "failed";
  }
) {
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
}

// Shared handler function for saving import result
async function handleSaveImportResult(
  ctx: MutationCtx,
  args: {
    jobId: string;
    result: Infer<typeof backgroundJobResultSchema>;
    status: "completed" | "failed";
    error?: string;
  }
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter(q => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  const updates: {
    status: "completed" | "failed";
    updatedAt: number;
    completedAt: number;
    result: Infer<typeof backgroundJobResultSchema>;
    error?: string;
  } = {
    status: args.status,
    updatedAt: Date.now(),
    completedAt: Date.now(),
    result: args.result,
  };

  if (args.error) {
    updates.error = args.error;
  }

  await ctx.db.patch(job._id, updates);
}

// Create a new background job with enhanced metadata
// Internal version for system operations
export const internalCreate = internalMutation({
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
    conversationIds: v.optional(v.array(v.id("conversations"))),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: (ctx, args) => handleCreateBackgroundJob(ctx, args, args.userId),
});

export const create = mutation({
  args: {
    jobId: v.string(),
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
    conversationIds: v.optional(v.array(v.id("conversations"))),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("User not authenticated");
    }

    return handleCreateBackgroundJob(ctx, args, userId);
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
  handler: (ctx, args) => handleUpdateJobStatus(ctx, args),
});

// Update job progress
export const updateProgress = mutation({
  args: {
    jobId: v.string(),
    processedItems: v.number(),
    totalItems: v.optional(v.number()),
  },
  handler: (ctx, args) => handleUpdateJobProgress(ctx, args),
});

// Save export result
export const saveExportResult = mutation({
  args: {
    jobId: v.string(),
    manifest: backgroundJobManifestSchema,
    fileStorageId: v.id("_storage"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: (ctx, args) => handleSaveExportResult(ctx, args),
});

// Save import result
export const saveImportResult = mutation({
  args: {
    jobId: v.string(),
    result: backgroundJobResultSchema,
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: (ctx, args) => handleSaveImportResult(ctx, args),
});

// Get download URL for export files
export const getExportDownloadUrl = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.jobId))
      .first();

    if (!job) {
      return null;
    }

    if (job.userId !== userId) {
      return null;
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
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    let query = ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("userId"), userId))
      .order("desc");

    if (args.type) {
      query = query.filter(q => q.eq(q.field("type"), args.type));
    }

    if (args.status) {
      query = query.filter(q => q.eq(q.field("status"), args.status));
    }

    const limit = args.limit || 50;
    return await query.take(limit);
  },
});

// Delete a background job
export const deleteJob = mutation({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("User not authenticated");
    }

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

    // Delete associated file if it exists
    if (job.fileStorageId) {
      try {
        await ctx.storage.delete(job.fileStorageId);
      } catch (error) {
        log.warn("Failed to delete associated file:", error);
      }
    }

    await ctx.db.delete(job._id);
  },
});

// Internal mutation to clean up old jobs for all users (called by cron)
export const cleanupOldJobsForAllUsers = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysOld = args.olderThanDays || 30;
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    // Find old completed/failed jobs for all users
    const oldJobs = await ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed")
          ),
          q.lt(q.field("updatedAt"), cutoffTime)
        )
      )
      .collect();

    // Delete old jobs and associated files
    let deletedCount = 0;
    for (const job of oldJobs) {
      // Delete associated file if it exists
      if (job.fileStorageId) {
        try {
          await ctx.storage.delete(job.fileStorageId);
        } catch (error) {
          log.warn("Failed to delete associated file:", error);
        }
      }

      await ctx.db.delete(job._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

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
              ? message.attachments?.map(attachment => ({
                  type: attachment.type,
                  url: attachment.url,
                  name: attachment.name,
                  size: attachment.size,
                  content: attachment.content,
                  thumbnail: attachment.thumbnail,
                  mimeType: attachment.mimeType,
                  storageId: attachment.storageId,
                  textFileId: attachment.textFileId,
                  extractedText: attachment.extractedText,
                  generatedImage: attachment.generatedImage,
                }))
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
  includeAttachments: boolean,
  embedAttachmentsInJson = true
) => {
  // Calculate attachment statistics
  let totalAttachments = 0;
  const attachmentTypes = new Map<string, number>();
  let totalAttachmentSize = 0;

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          totalAttachments++;
          attachmentTypes.set(
            attachment.type,
            (attachmentTypes.get(attachment.type) || 0) + 1
          );
          totalAttachmentSize += attachment.size || 0;
        }
      }
    }
  }

  const manifest = {
    totalConversations: conversations.length,
    totalMessages: conversations.reduce(
      (sum, conv) => sum + conv.messages.length,
      0
    ),
    totalAttachments,
    attachmentTypes: Object.fromEntries(attachmentTypes),
    totalAttachmentSizeBytes: totalAttachmentSize,
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
        attachments:
          includeAttachments && msg.attachments
            ? msg.attachments.map(attachment => {
                if (embedAttachmentsInJson) {
                  // Include all attachment data when embedding in JSON
                  return attachment as ExportAttachment;
                }
                // Exclude storage references and content when not embedding
                const {
                  storageId: _,
                  textFileId: __,
                  content: ___,
                  ...rest
                } = attachment;
                return rest as Omit<
                  ExportAttachment,
                  "storageId" | "textFileId" | "content"
                >;
              })
            : undefined,
        citations: msg.citations,
      })),
    })),
  };
};

// Internal versions for system operations (no auth checks)
export const internalUpdateStatus = internalMutation({
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
  handler: (ctx, args) => handleUpdateJobStatus(ctx, args),
});

export const internalUpdateProgress = internalMutation({
  args: {
    jobId: v.string(),
    processedItems: v.number(),
    totalItems: v.optional(v.number()),
  },
  handler: (ctx, args) => handleUpdateJobProgress(ctx, args),
});

export const internalSaveExportResult = internalMutation({
  args: {
    jobId: v.string(),
    manifest: backgroundJobManifestSchema,
    fileStorageId: v.id("_storage"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: (ctx, args) => handleSaveExportResult(ctx, args),
});

export const internalSaveImportResult = internalMutation({
  args: {
    jobId: v.string(),
    result: backgroundJobResultSchema,
    status: v.union(v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: (ctx, args) => handleSaveImportResult(ctx, args),
});
