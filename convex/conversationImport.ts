import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { createUserFileEntriesHandler } from "./fileStorage";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  webCitationSchema,
} from "./lib/schemas";

// Internal mutation to process a batch of conversations
export const processBatch = internalMutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: v.string(),
            content: v.string(),
            createdAt: v.optional(v.number()),
            model: v.optional(v.string()),
            provider: v.optional(v.string()),
            reasoning: v.optional(v.string()),
            attachments: v.optional(v.array(attachmentSchema)),
            citations: v.optional(v.array(webCitationSchema)),
            metadata: v.optional(extendedMessageMetadataSchema),
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
    let totalUserMessages = 0;

    // Process all conversations in the batch
    for (let i = 0; i < args.conversations.length; i++) {
      const convData = args.conversations[i];
      if (!convData) {
        continue;
      }
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
      const messagesArray = Array.isArray(convData.messages)
        ? convData.messages
        : [];
      const messagesToInsert = messagesArray
        .filter(msg => msg?.content && msg.content.trim() !== "")
        .map((msg, msgIndex) => ({
          conversationId,
          userId: args.userId,
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

      // Insert all messages and count user messages
      for (const messageData of messagesToInsert) {
        const messageId = await ctx.db.insert("messages", messageData);

        // Create userFiles entries if message has attachments
        if (messageData.attachments && messageData.attachments.length > 0) {
          await createUserFileEntriesHandler(ctx, {
            userId: args.userId,
            messageId,
            conversationId,
            attachments: messageData.attachments,
          });
        }

        if (messageData.role === "user") {
          totalUserMessages++;
        }
      }

      conversationIds.push(conversationId);
    }

    // Update user stats for imported conversations and messages
    if (conversationIds.length > 0 || totalUserMessages > 0) {
      const user = await ctx.db.get(args.userId);
      if (user) {
        await ctx.db.patch(args.userId, {
          conversationCount: Math.max(
            0,
            (user.conversationCount || 0) + conversationIds.length
          ),
          totalMessageCount: Math.max(
            0,
            (user.totalMessageCount || 0) + totalUserMessages
          ),
        });
      }
    }

    return { conversationIds };
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
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.importId,
        status: "processing",
      });

      // Get existing conversation titles for duplicate detection
      let existingTitles = new Set<string>();
      if (args.skipDuplicates) {
        const existingTitlesList = await ctx.runQuery(
          internal.conversationImport.getExistingTitles,
          { userId: args.userId }
        );
        existingTitles = new Set(existingTitlesList);
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
            conv.messages.every(
              (msg: { content?: string }) =>
                !msg.content || msg.content.trim() === ""
            )
          ) {
            return false;
          }
          return true;
        })
        .slice(0, 1000); // Limit to prevent excessive operations

      // Update initial progress
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.importId,
        processedItems: 0,
        totalItems: validConversations.length,
      });

      // Process conversations in batches
      const batchSize = 10;
      let totalImported = 0;
      const errors: string[] = [];
      const allImportedIds: string[] = [];

      for (let i = 0; i < validConversations.length; i += batchSize) {
        const batch = validConversations.slice(i, i + batchSize);

        try {
          const batchResult = await ctx.runMutation(
            internal.conversationImport.processBatch,
            {
              conversations: batch,
              userId: args.userId,
              baseTime: Date.now() + i, // Ensure unique timestamps
            }
          );

          totalImported += batchResult.conversationIds.length;
          allImportedIds.push(...batchResult.conversationIds);

          // Update progress based on actual processed items
          await ctx.runMutation(
            internal.backgroundJobs.internalUpdateProgress,
            {
              jobId: args.importId,
              processedItems: i + batchSize, // Update based on batch progress
              totalItems: validConversations.length,
            }
          );
        } catch (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error}`);

          // Still update progress even if batch failed
          await ctx.runMutation(
            internal.backgroundJobs.internalUpdateProgress,
            {
              jobId: args.importId,
              processedItems: i + batchSize,
              totalItems: validConversations.length,
            }
          );
        }
      }

      // Save final result with imported conversation IDs
      await ctx.runMutation(internal.backgroundJobs.internalSaveImportResult, {
        jobId: args.importId,
        result: {
          totalImported,
          totalProcessed: validConversations.length,
          errors,
          conversationIds: allImportedIds,
        },
        status: "completed",
      });

      return { success: true, totalImported };
    } catch (error) {
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.importId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

// Internal query to get existing conversation titles for duplicate detection
export const getExistingTitles = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existingConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", args.userId))
      .collect();
    return existingConversations.map(c => c.title);
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
            !(
              msg.role &&
              ["user", "assistant", "system", "context"].includes(msg.role)
            )
          ) {
            validation.errors.push(
              `Conversation ${index + 1}, Message ${msgIndex + 1}: Invalid role "${msg.role}"`
            );
            continue;
          }

          if (!msg.content || typeof msg.content !== "string") {
            validation.errors.push(
              `Conversation ${index + 1}, Message ${msgIndex + 1}: Missing or invalid content`
            );
            continue;
          }

          validMessageCount++;
        }

        validation.stats.validConversations++;
        validation.stats.totalMessages += conv.messages.length;
        validation.stats.validMessages += validMessageCount;
      } catch (error) {
        validation.errors.push(
          `Conversation ${index + 1}: Unexpected error - ${error}`
        );
      }
    }

    // Calculate averages
    if (validation.stats.validConversations > 0) {
      validation.stats.averageMessagesPerConversation =
        validation.stats.validMessages / validation.stats.validConversations;
    }

    // Determine overall validity
    validation.isValid = validation.errors.length === 0;

    return validation;
  },
});
