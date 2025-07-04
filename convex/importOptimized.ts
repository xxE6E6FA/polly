import { ConvexError, v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { api, internal } from "./_generated/api";
import {
  attachmentSchema,
  messageRoleSchema,
  messageMetadataSchema,
  webCitationSchema,
} from "./lib/schemas";

// Optimized bulk import with minimal database operations
export const bulkImportOptimized = mutation({
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
    const batchSize = args.batchSize || 50; // Larger batch size for efficiency

    // Single query to get existing conversation titles if needed
    let existingTitles = new Set<string>();
    if (args.skipDuplicates) {
      const existingConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      existingTitles = new Set(existingConversations.map(c => c.title));
    }

    // Pre-process conversations to filter duplicates and validate
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
      .slice(0, 1000); // Hard limit to prevent excessive operations

    if (validConversations.length === 0) {
      return {
        importedCount: 0,
        skippedCount: args.conversations.length,
        errors: [],
        conversationIds: [],
      };
    }

    // Process in batches to avoid hitting database limits
    const results = [];
    const errors = [];

    for (let i = 0; i < validConversations.length; i += batchSize) {
      const batch = validConversations.slice(i, i + batchSize);

      try {
        const batchResult: { conversationIds: string[] } =
          await ctx.runMutation(internal.importOptimized.processBatch, {
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

// Internal mutation to process a batch of conversations efficiently
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
        isArchived: convData.isArchived || false,
        isPinned: convData.isPinned || false,
        personaId: convData.personaId,
        // Ensure streaming state is properly set
        isStreaming: false,
      });

      // Batch insert messages for this conversation
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

      // Insert all messages for this conversation
      for (const messageData of messagesToInsert) {
        await ctx.db.insert("messages", messageData);
      }

      conversationIds.push(conversationId);
    }

    return { conversationIds };
  },
});

// Optimized background import with minimal function calls
export const scheduleOptimizedImport = action({
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

    // Generate import metadata if not provided
    const dateStr = new Date().toLocaleDateString();
    const count = limitedConversations.length;
    const title =
      args.title ||
      (count === 1
        ? `Optimized Import - ${dateStr}`
        : `${count} Conversations Import - ${dateStr}`);
    const description =
      args.description ||
      `Optimized import of ${count} conversation${count !== 1 ? "s" : ""} on ${dateStr}`;

    // Create import job record
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.importId,
      userId,
      type: "import",
      totalItems: limitedConversations.length,
      title,
      description,
    });

    // For larger imports, use ultra-optimized processing
    if (limitedConversations.length > 50) {
      // Schedule ultra-optimized processing for large imports
      await ctx.scheduler.runAfter(
        100,
        api.importOptimized.processOptimizedImport,
        {
          conversations: limitedConversations,
          importId: args.importId,
          skipDuplicates: args.skipDuplicates || true,
          userId,
        }
      );
    } else {
      // Use standard optimized processing for smaller imports
      await ctx.scheduler.runAfter(
        100,
        api.importOptimized.processOptimizedImport,
        {
          conversations: limitedConversations,
          importId: args.importId,
          skipDuplicates: args.skipDuplicates || true,
          userId,
        }
      );
    }

    return { importId: args.importId, status: "scheduled" };
  },
});

export const processOptimizedImport = action({
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

      // Process conversations in optimized batches
      const batchSize = 10;
      let totalImported = 0;
      const errors: string[] = [];

      for (let i = 0; i < args.conversations.length; i += batchSize) {
        const batch = args.conversations.slice(i, i + batchSize);

        try {
          const batchResult = await ctx.runMutation(
            api.importOptimized.bulkImportOptimized,
            {
              conversations: batch,
              skipDuplicates: args.skipDuplicates,
            }
          );

          totalImported += batchResult.importedCount;
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

      // Save final result
      await ctx.runMutation(api.backgroundJobs.saveImportResult, {
        jobId: args.importId,
        result: {
          totalImported,
          totalProcessed: args.conversations.length,
          errors,
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

// Ultra-efficient import for trusted data (minimal validation)
export const ultraFastImport = mutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: messageRoleSchema,
            content: v.string(),
            createdAt: v.optional(v.number()),
          })
        ),
        createdAt: v.optional(v.number()),
      })
    ),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const conversationIds = [];

    // Minimal validation - assume data is clean
    const validConversations = args.conversations
      .filter(conv => conv.title && conv.messages && conv.messages.length > 0)
      .slice(0, 100); // Hard limit for ultra-fast processing

    // Process with minimal overhead
    for (let i = 0; i < validConversations.length; i++) {
      const conv = validConversations[i];

      // Single insert for conversation
      const conversationId = await ctx.db.insert("conversations", {
        title: conv.title,
        userId: args.userId,
        createdAt: conv.createdAt || now + i,
        updatedAt: conv.createdAt || now + i,
        isStreaming: false,
      });

      // Batch insert messages with minimal processing
      for (let j = 0; j < conv.messages.length; j++) {
        const msg = conv.messages[j];
        if (msg.content && msg.content.trim()) {
          await ctx.db.insert("messages", {
            conversationId,
            role: msg.role,
            content: msg.content,
            isMainBranch: true,
            createdAt: msg.createdAt || now + i + j,
          });
        }
      }

      conversationIds.push(conversationId);
    }

    return {
      importedCount: conversationIds.length,
      conversationIds,
    };
  },
});

// Query to get import statistics (for monitoring)
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

    // Get recent conversations (potential imports)
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

// Batch cleanup for import-related data
export const cleanupImportData = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const daysOld = args.olderThanDays || 7; // Default 7 days for import jobs
    const dryRun = args.dryRun || false;
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

// Ultra-optimized import with transaction-like behavior
export const ultraOptimizedImport = internalMutation({
  args: {
    conversationBatch: v.array(
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
    existingTitles: v.array(v.string()),
    skipDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existingTitlesSet = new Set(args.existingTitles);
    const conversationIds = [];
    const errors = [];
    let importedCount = 0;

    // Pre-validate all conversations before any database operations
    const validConversations = [];
    for (const conv of args.conversationBatch) {
      // Skip duplicates
      if (args.skipDuplicates && existingTitlesSet.has(conv.title)) {
        continue;
      }

      // Validate conversation has messages
      if (!conv.messages || conv.messages.length === 0) {
        errors.push(`Conversation "${conv.title}" has no messages`);
        continue;
      }

      // Validate messages have content
      const validMessages = conv.messages.filter(
        msg => msg.content && msg.content.trim() !== ""
      );

      if (validMessages.length === 0) {
        errors.push(`Conversation "${conv.title}" has no valid messages`);
        continue;
      }

      validConversations.push({
        ...conv,
        messages: validMessages,
      });
    }

    // Batch insert all conversations and messages
    try {
      for (let i = 0; i < validConversations.length; i++) {
        const conv = validConversations[i];
        const convTimestamp = args.baseTime + i;

        // Insert conversation
        const conversationId = await ctx.db.insert("conversations", {
          title: conv.title,
          userId: args.userId,
          createdAt: conv.createdAt || convTimestamp,
          updatedAt: conv.updatedAt || convTimestamp,
          isArchived: conv.isArchived || false,
          isPinned: conv.isPinned || false,
          personaId: conv.personaId,
          isStreaming: false, // Ensure proper streaming state
        });

        // Batch insert messages with optimized ordering
        const messageInsertPromises = conv.messages.map((msg, msgIndex) =>
          ctx.db.insert("messages", {
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
          })
        );

        // Execute all message inserts in parallel for this conversation
        await Promise.all(messageInsertPromises);

        conversationIds.push(conversationId);
        importedCount++;
      }
    } catch (error) {
      errors.push(`Database operation failed: ${error}`);
    }

    return {
      conversationIds,
      importedCount,
      errors,
    };
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

// Enhanced validation function
export const validateImportData = mutation({
  args: {
    sampleConversations: v.array(v.any()),
    maxSampleSize: v.optional(v.number()),
  },
  handler: (ctx, args) => {
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

        if (!conv.messages || !Array.isArray(conv.messages)) {
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
            !msg.role ||
            !["user", "assistant", "system"].includes(msg.role)
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
