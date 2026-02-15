import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { getAuthenticatedUser } from "../shared_utils";
import { handleCreateBackgroundJob, type CreateJobArgs } from "./helpers";

// Handler for the public create mutation (with auth)
export async function handleAuthenticatedCreate(
  ctx: MutationCtx,
  args: Omit<CreateJobArgs, "conversationIds" | "includeAttachments"> & {
    conversationIds?: Id<"conversations">[];
    includeAttachments?: boolean;
  },
) {
  const userId = await getAuthenticatedUser(ctx);
  return handleCreateBackgroundJob(ctx, args, userId);
}

// Handler for deleteJob mutation
export async function handleDeleteJob(
  ctx: MutationCtx,
  args: { jobId: string },
) {
  const userId = await getAuthenticatedUser(ctx);

  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
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
      console.warn("Failed to delete associated file:", error);
    }
  }

  await ctx.db.delete("backgroundJobs", job._id);
}

// Handler for cleanupOldJobsForAllUsers internal mutation
export async function handleCleanupOldJobs(
  ctx: MutationCtx,
  args: {
    olderThanDays?: number;
    batchSize?: number;
  },
) {
  const daysOld = args.olderThanDays || 30;
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const batchSize = args.batchSize || 100;

  // Query completed jobs using index (more efficient than filter)
  const completedJobs = await ctx.db
    .query("backgroundJobs")
    .withIndex("by_status_and_created", (q) => q.eq("status", "completed"))
    .filter((q) => q.lt(q.field("updatedAt"), cutoffTime))
    .take(batchSize);

  // Query failed jobs using index
  const failedJobs = await ctx.db
    .query("backgroundJobs")
    .withIndex("by_status_and_created", (q) => q.eq("status", "failed"))
    .filter((q) => q.lt(q.field("updatedAt"), cutoffTime))
    .take(batchSize);

  const oldJobs = [...completedJobs, ...failedJobs];

  // Delete old jobs and associated files
  let deletedCount = 0;
  for (const job of oldJobs) {
    // Delete associated file if it exists
    if (job.fileStorageId) {
      try {
        await ctx.storage.delete(job.fileStorageId);
      } catch (error) {
        console.warn("Failed to delete associated file:", error);
      }
    }

    await ctx.db.delete("backgroundJobs", job._id);
    deletedCount++;
  }

  // Return whether more jobs may exist (for potential re-scheduling)
  return { deletedCount, hasMore: oldJobs.length >= batchSize };
}
