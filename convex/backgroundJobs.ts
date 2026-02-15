import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  backgroundJobManifestSchema,
  backgroundJobResultSchema,
} from "./lib/schemas";

// Re-export types and helpers used by other modules
export type {
  ExportAttachment,
  ExportConversation,
} from "./lib/background_jobs/helpers";
export { createConvexExportData } from "./lib/background_jobs/helpers";

import {
  handleCreateBackgroundJob,
  handleSaveExportResult,
  handleSaveImportResult,
  handleUpdateJobProgress,
  handleUpdateJobStatus,
} from "./lib/background_jobs/helpers";
import {
  handleAuthenticatedCreate,
  handleCleanupOldJobs,
  handleDeleteJob,
} from "./lib/background_jobs/mutation_handlers";
import {
  handleGetExportData,
  handleGetExportDownloadUrl,
  handleListUserJobs,
} from "./lib/background_jobs/query_handlers";

const jobTypeSchema = v.union(
  v.literal("export"),
  v.literal("import"),
  v.literal("bulk_archive"),
  v.literal("bulk_delete"),
  v.literal("conversation_summary"),
  v.literal("data_migration"),
  v.literal("model_migration"),
  v.literal("backup")
);

const jobStatusSchema = v.union(
  v.literal("scheduled"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

const jobCategorySchema = v.optional(
  v.union(
    v.literal("data_transfer"),
    v.literal("bulk_operations"),
    v.literal("ai_processing"),
    v.literal("maintenance")
  )
);

const jobPrioritySchema = v.optional(
  v.union(
    v.literal("low"),
    v.literal("normal"),
    v.literal("high"),
    v.literal("urgent")
  )
);

// ============================================================================
// Convex function registrations
// ============================================================================

export const internalCreate = internalMutation({
  args: {
    jobId: v.string(),
    userId: v.id("users"),
    type: jobTypeSchema,
    category: jobCategorySchema,
    totalItems: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    payload: v.optional(v.any()),
    priority: jobPrioritySchema,
    conversationIds: v.optional(v.array(v.id("conversations"))),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: (ctx, args) => handleCreateBackgroundJob(ctx, args, args.userId),
});

export const create = mutation({
  args: {
    jobId: v.string(),
    type: jobTypeSchema,
    category: jobCategorySchema,
    totalItems: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    payload: v.optional(v.any()),
    priority: jobPrioritySchema,
    conversationIds: v.optional(v.array(v.id("conversations"))),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: handleAuthenticatedCreate,
});

export const updateStatus = mutation({
  args: {
    jobId: v.string(),
    status: jobStatusSchema,
    error: v.optional(v.string()),
  },
  handler: (ctx, args) => handleUpdateJobStatus(ctx, args),
});

export const updateProgress = mutation({
  args: {
    jobId: v.string(),
    processedItems: v.number(),
    totalItems: v.optional(v.number()),
  },
  handler: (ctx, args) => handleUpdateJobProgress(ctx, args),
});

export const saveExportResult = mutation({
  args: {
    jobId: v.string(),
    manifest: backgroundJobManifestSchema,
    fileStorageId: v.id("_storage"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: (ctx, args) => handleSaveExportResult(ctx, args),
});

export const saveImportResult = mutation({
  args: {
    jobId: v.string(),
    result: backgroundJobResultSchema,
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: (ctx, args) => handleSaveImportResult(ctx, args),
});

export const getExportDownloadUrl = query({
  args: {
    jobId: v.string(),
  },
  handler: handleGetExportDownloadUrl,
});

export const listUserJobs = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(jobTypeSchema),
    status: v.optional(jobStatusSchema),
  },
  handler: handleListUserJobs,
});

export const deleteJob = mutation({
  args: {
    jobId: v.string(),
  },
  handler: handleDeleteJob,
});

export const cleanupOldJobsForAllUsers = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: handleCleanupOldJobs,
});

export const getExportData = internalQuery({
  args: {
    conversationIds: v.array(v.id("conversations")),
    userId: v.id("users"),
    includeAttachments: v.optional(v.boolean()),
  },
  handler: handleGetExportData,
});

// Internal versions for system operations (no auth checks)
export const internalUpdateStatus = internalMutation({
  args: {
    jobId: v.string(),
    status: jobStatusSchema,
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
