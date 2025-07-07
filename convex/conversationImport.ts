import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  attachmentSchema,
  messageMetadataSchema,
  messageRoleSchema,
  webCitationSchema,
} from "./lib/schemas";

// Bulk import conversations with duplicate detection
export const bulkImport = mutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: messageRoleSchema,
            content: v.string(),
            createdAt: v.optional(v.number()),
            model: v.optional(v.string()),
            provider: v.optional(v.string()),
            reasoning: v.optional(v.string()),
            attachments: v.optional(v.array(attachmentSchema)),
            citations: v.optional(v.array(webCitationSchema)),
            metadata: v.optional(messageMetadataSchema),
          })
        ),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
        isArchived: v.optional(v.boolean()),
        isPinned: v.optional(v.boolean()),
        personaId: v.optional(v.id("personas")),
      })
    ),
    skipDuplicates: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    importedCount: number;
    skippedCount: number;
    errors: string[];
    conversationIds: string[];
  }> => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const batchSize = args.batchSize || 50;

    // Get existing conversation titles for duplicate detection
    let existingTitles = new Set<string>();
    if (args.skipDuplicates) {
      const existingConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      existingTitles = new Set(existingConversations.map(c => c.title));
    }

    // Filter and validate conversations
    const validConversations = args.conversations
      .filter(conv => {
        // Skip duplicates
        if (args.skipDuplicates && existingTitles.has(conv.title)) {
          return false;
        }
        // Skip conversations with no messages
        if (!conv.messages || conv.messages.length === 0) {
          return false;
        }
        // Skip conversations with only empty messages
        if (
          conv.messages.every(msg => !msg.content || msg.content.trim() === "")
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 1000); // Limit to prevent excessive operations

    if (validConversations.length === 0) {
      return {
        importedCount: 0,
        skippedCount: args.conversations.length,
        errors: [],
        conversationIds: [],
      };
    }

    // Process in batches
    const results = [];
    const errors = [];

    for (let i = 0; i < validConversations.length; i += batchSize) {
      const batch = validConversations.slice(i, i + batchSize);

      try {
        const batchResult: { conversationIds: string[] } =
          await ctx.runMutation(internal.conversationImport.processBatch, {
            conversations: batch,
            userId,
            baseTime: now + i, // Ensure unique timestamps
          });

        results.push(...batchResult.conversationIds);
      } catch (error) {
        errors.push(`Batch ${i / batchSize + 1} failed: ${error}`);
      }
    }

    return {
      importedCount: results.length,
      skippedCount: args.conversations.length - validConversations.length,
      errors,
      conversationIds: results,
    };
  },
});

// Internal mutation to process a batch of conversations
export const processBatch = internalMutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: messageRoleSchema,
            content: v.string(),
            createdAt: v.optional(v.number()),
            model: v.optional(v.string()),
            provider: v.optional(v.string()),
            reasoning: v.optional(v.string()),
            attachments: v.optional(v.array(attachmentSchema)),
            citations: v.optional(v.array(webCitationSchema)),
            metadata: v.optional(messageMetadataSchema),
          })
        ),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
        isArchived: v.optional(v.boolean()),
        isPinned: v.optional(v.boolean()),
        personaId: v.optional(v.id("personas")),
      })
    ),
    userId: v.id("users"),
    baseTime: v.number(),
  },
  handler: async (ctx, args) => {
    const conversationIds = [];

    // Process all conversations in the batch
    for (let i = 0; i < args.conversations.length; i++) {
      const convData = args.conversations[i];
      const convTimestamp = args.baseTime + i;

      // Insert conversation
      const conversationId = await ctx.db.insert("conversations", {
        title: convData.title,
        userId: args.userId,
        createdAt: convData.createdAt || convTimestamp,
        updatedAt: convData.updatedAt || convTimestamp,
        isArchived: convData.isArchived,
        isPinned: convData.isPinned,
        personaId: convData.personaId,
        isStreaming: false,
      });

      // Insert messages for this conversation
      const messagesToInsert = convData.messages
        .filter(msg => msg.content && msg.content.trim() !== "")
        .map((msg, msgIndex) => ({
          conversationId,
          role: msg.role,
          content: msg.content,
          isMainBranch: true,
          createdAt: msg.createdAt || convTimestamp + msgIndex,
          model: msg.model,
          provider: msg.provider,
          reasoning: msg.reasoning,
          attachments: msg.attachments,
          citations: msg.citations,
          metadata: msg.metadata,
        }));

      // Insert all messages
      for (const messageData of messagesToInsert) {
        await ctx.db.insert("messages", messageData);
      }

      conversationIds.push(conversationId);
    }

    return { conversationIds };
  },
});

// Schedule a background import job
export const scheduleImport = action({
  args: {
    conversations: v.array(v.any()),
    importId: v.string(),
    skipDuplicates: v.optional(v.boolean()),
    maxConversations: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Limit conversations if specified
    const limitedConversations = args.maxConversations
      ? args.conversations.slice(0, args.maxConversations)
      : args.conversations;

    // Generate import metadata
    const dateStr = new Date().toLocaleDateString();
    const count = limitedConversations.length;
    const title =
      args.title ||
      (count === 1
        ? `Import - ${dateStr}`
        : `${count} Conversations Import - ${dateStr}`);
    const description =
      args.description ||
      `Import of ${count} conversation${count !== 1 ? "s" : ""} on ${dateStr}`;

    // Create import job record
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.importId,
      userId,
      type: "import",
      totalItems: limitedConversations.length,
      title,
      description,
    });

    // Schedule the import processing
    await ctx.scheduler.runAfter(100, api.conversationImport.processImport, {
      conversations: limitedConversations,
      importId: args.importId,
      skipDuplicates: true,
      userId,
    });

    return { importId: args.importId, status: "scheduled" };
  },
});

// Process a scheduled import job
export const processImport = action({
  args: {
    conversations: v.array(v.any()),
    importId: v.string(),
    skipDuplicates: v.optional(v.boolean()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.importId,
        status: "processing",
      });

      // Process conversations in batches
      const batchSize = 10;
      let totalImported = 0;
      const errors: string[] = [];
      const allImportedIds: string[] = [];

      for (let i = 0; i < args.conversations.length; i += batchSize) {
        const batch = args.conversations.slice(i, i + batchSize);

        try {
          const batchResult = await ctx.runMutation(
            api.conversationImport.bulkImport,
            {
              conversations: batch,
              skipDuplicates: args.skipDuplicates,
            }
          );

          totalImported += batchResult.importedCount;
          allImportedIds.push(...batchResult.conversationIds);
          errors.push(...batchResult.errors);

          // Update progress
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.importId,
            processedItems: Math.min(i + batchSize, args.conversations.length),
            totalItems: args.conversations.length,
          });
        } catch (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error}`);
        }
      }

      // Save final result with imported conversation IDs
      await ctx.runMutation(api.backgroundJobs.saveImportResult, {
        jobId: args.importId,
        result: {
          totalImported,
          totalProcessed: args.conversations.length,
          errors,
          conversationIds: allImportedIds,
        },
        status: "completed",
      });

      return { success: true, totalImported };
    } catch (error) {
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.importId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

// Get import statistics
export const getImportStats = query({
  args: {
    userId: v.optional(v.id("users")),
    timeRange: v.optional(v.number()), // Hours
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await requireAuth(ctx));
    const timeRange = args.timeRange || 24; // Default 24 hours
    const cutoffTime = Date.now() - timeRange * 60 * 60 * 1000;

    // Get recent import jobs
    const recentImports = await ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("type"), "import"),
          q.gt(q.field("createdAt"), cutoffTime)
        )
      )
      .collect();

    // Get recent conversations
    const recentConversations = await ctx.db
      .query("conversations")
      .filter(q =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.gt(q.field("createdAt"), cutoffTime)
        )
      )
      .collect();

    return {
      recentImports: recentImports.length,
      recentConversations: recentConversations.length,
      completedImports: recentImports.filter(job => job.status === "completed")
        .length,
      failedImports: recentImports.filter(job => job.status === "failed")
        .length,
      totalImportedConversations: recentImports
        .filter(job => job.status === "completed")
        .reduce((sum, job) => sum + (job.result?.totalImported || 0), 0),
    };
  },
});

// Clean up old import data
export const cleanupImportData = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const daysOld = args.olderThanDays || 7;
    const dryRun = args.dryRun;
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    // Find old import jobs
    const oldJobs = await ctx.db
      .query("backgroundJobs")
      .filter(q =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("type"), "import"),
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed")
          ),
          q.lt(q.field("updatedAt"), cutoffTime)
        )
      )
      .collect();

    if (dryRun) {
      return {
        wouldDelete: oldJobs.length,
        jobs: oldJobs.map(job => ({
          jobId: job.jobId,
          status: job.status,
          createdAt: job.createdAt,
        })),
      };
    }

    // Delete old jobs
    let deletedCount = 0;
    for (const job of oldJobs) {
      await ctx.db.delete(job._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// Get import status for a specific job
export const getImportStatus = query({
  args: {
    importId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.importId))
      .first();

    if (!job) {
      throw new ConvexError("Import job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    return {
      jobId: job.jobId,
      type: job.type,
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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  },
});

// Get import result for a completed job
export const getImportResult = query({
  args: {
    importId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const job = await ctx.db
      .query("backgroundJobs")
      .filter(q => q.eq(q.field("jobId"), args.importId))
      .first();

    if (!job) {
      throw new ConvexError("Import job not found");
    }

    if (job.userId !== userId) {
      throw new ConvexError("Access denied");
    }

    if (job.status !== "completed") {
      return null;
    }

    return job.result;
  },
});

// Validate import data before processing
export const validateImportData = mutation({
  args: {
    sampleConversations: v.array(v.any()),
    maxSampleSize: v.optional(v.number()),
  },
  handler: (_ctx, args) => {
    const maxSample = args.maxSampleSize || 10;
    const sample = args.sampleConversations.slice(0, maxSample);

    const validation = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      stats: {
        totalConversations: args.sampleConversations.length,
        validConversations: 0,
        totalMessages: 0,
        validMessages: 0,
        averageMessagesPerConversation: 0,
      },
    };

    for (const [index, conv] of sample.entries()) {
      try {
        // Validate conversation structure
        if (!conv.title || typeof conv.title !== "string") {
          validation.errors.push(
            `Conversation ${index + 1}: Missing or invalid title`
          );
          continue;
        }

        if (!(conv.messages && Array.isArray(conv.messages))) {
          validation.errors.push(
            `Conversation ${index + 1}: Missing or invalid messages array`
          );
          continue;
        }

        if (conv.messages.length === 0) {
          validation.warnings.push(
            `Conversation ${index + 1}: No messages found`
          );
          continue;
        }

        // Validate messages
        let validMessageCount = 0;
        for (const [msgIndex, msg] of conv.messages.entries()) {
          if (
            !msg.content ||
            typeof msg.content !== "string" ||
            msg.content.trim() === ""
          ) {
            validation.warnings.push(
              `Conversation ${index + 1}, Message ${msgIndex + 1}: Empty content`
            );
            continue;
          }

          if (
            !(msg.role && ["user", "assistant", "system"].includes(msg.role))
          ) {
            validation.errors.push(
              `Conversation ${index + 1}, Message ${msgIndex + 1}: Invalid role`
            );
            continue;
          }

          validMessageCount++;
        }

        if (validMessageCount > 0) {
          validation.stats.validConversations++;
          validation.stats.validMessages += validMessageCount;
        }

        validation.stats.totalMessages += conv.messages.length;
      } catch (error) {
        validation.errors.push(
          `Conversation ${index + 1}: Validation error - ${error}`
        );
      }
    }

    validation.stats.averageMessagesPerConversation =
      validation.stats.validConversations > 0
        ? Math.round(
            validation.stats.validMessages / validation.stats.validConversations
          )
        : 0;

    validation.isValid = validation.errors.length === 0;

    return validation;
  },
});
