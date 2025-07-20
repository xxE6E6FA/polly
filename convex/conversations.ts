import { getAuthUserId } from "@convex-dev/auth/server";
import {
  isPollyModel,
  MESSAGE_BATCH_SIZE,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";

import type { MessageDoc } from "./lib/conversation_utils";
import {
  buildContextMessages,
  deleteMessagesAfterIndex,
  ensureStreamingCleared,
  executeStreamingAction,
  findStreamingMessage,
  incrementUserMessageStats,
  processAttachmentsForStorage,
  setupAndStartStreaming,
} from "./lib/conversation_utils";
import {
  createEmptyPaginationResult,
  paginationOptsSchema,
  validatePaginationOpts,
} from "./lib/pagination";
import {
  attachmentSchema,
  attachmentWithMimeTypeSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";
import type { Citation } from "./types";

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    firstMessage: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if this is a Polly free model and enforce limits
    const isPollyModelResult = isPollyModel(args?.provider);

    if (isPollyModelResult && !user.hasUnlimitedCalls) {
      const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
      const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
      if (monthlyMessagesSent >= monthlyLimit) {
        throw new Error("Monthly Polly model message limit reached.");
      }
    }

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title || "New Conversation",
      userId: user._id,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(user._id, {
      conversationCount: Math.max(0, (user.conversationCount || 0) + 1),
    });

    // Create user message (count this one)
    const userMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.firstMessage,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      reasoningConfig: args.reasoningConfig,
      isMainBranch: true,
      createdAt: Date.now(),
    });

    // Only increment stats if this is a new conversation with a first message
    // (not for private conversation imports which have pre-existing messages)
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      await incrementUserMessageStats(ctx, args.provider);
    }

    // Create empty assistant message for streaming (don't count assistant messages)
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      model: args.model,
      provider: args.provider,
      isMainBranch: true,
      createdAt: Date.now(),
    });

    // Start streaming assistant response if model and provider are provided
    if (args.model && args.provider) {
      // Execute streaming action in the background
      // The action will build context messages from the stored messages, including attachments
      await ctx.scheduler.runAfter(0, api.ai.streamResponse, {
        messages: [
          { role: "system" as const, content: "" }, // Placeholder - will be replaced by action
          { role: "user" as const, content: "" }, // Placeholder - will be replaced by action
        ],
        messageId: assistantMessageId,
        model: args.model,
        provider: args.provider,
        temperature: 0.7,
        maxTokens: 8192,
        enableWebSearch: args.useWebSearch,
        webSearchMaxResults: 5,
        reasoningConfig: args.reasoningConfig?.enabled
          ? {
              effort: args.reasoningConfig.effort,
              maxTokens: args.reasoningConfig.maxTokens,
            }
          : undefined,
      });
    }

    // Schedule title generation in the background
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      await ctx.scheduler.runAfter(
        100,
        api.titleGeneration.generateTitleBackground,
        {
          conversationId,
          message: args.firstMessage,
        }
      );
    }

    return {
      conversationId,
      userMessageId,
      assistantMessageId,
      user,
    };
  },
});

export const savePrivateConversation = action({
  args: {
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        createdAt: v.number(),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        reasoning: v.optional(v.string()),
        attachments: v.optional(v.array(attachmentWithMimeTypeSchema)),
        citations: v.optional(v.array(webCitationSchema)),
        metadata: v.optional(
          v.object({
            tokenCount: v.optional(v.number()),
            reasoningTokenCount: v.optional(v.number()),
            finishReason: v.optional(v.string()),
            duration: v.optional(v.number()),
            stopped: v.optional(v.boolean()),
          })
        ),
      })
    ),
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
  },
  handler: async (ctx, args): Promise<Id<"conversations">> => {
    // Get authenticated user - this is the correct pattern for actions
    const user = await ctx.runQuery(api.users.current);
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Block anonymous users from saving private conversations
    if (user.isAnonymous) {
      throw new Error("Anonymous users cannot save private conversations.");
    }
    // Generate a title from the first user message or use provided title
    const conversationTitle = args.title || "New conversation";

    // Create the conversation
    const createResult = await ctx.runMutation(api.conversations.create, {
      title: conversationTitle,
      personaId: args.personaId,
      firstMessage: "", // No initial message, all messages are added below
    });
    const conversationId = createResult.conversationId;

    // Extract model/provider from the first user message for stats tracking
    // Only increment stats once for the entire conversation, not per message
    const firstUserMessage = args.messages.find(msg => msg.role === "user");
    if (firstUserMessage?.model && firstUserMessage?.provider) {
      try {
        await incrementUserMessageStats(ctx, firstUserMessage.provider);
      } catch (error) {
        // If the model doesn't exist in the user's database, skip stats increment
        // This can happen when importing private conversations with models the user no longer has
        console.warn(
          `Skipping stats increment for model ${firstUserMessage.model}/${firstUserMessage.provider}: ${error}`
        );
      }
    }

    // Process and save all messages to the conversation
    for (const message of args.messages as Array<{
      role: string;
      content: string;
      createdAt: number;
      model?: string;
      provider?: string;
      reasoning?: string;
      attachments?: Array<{
        type: "image" | "pdf" | "text";
        url: string;
        name: string;
        size: number;
        content?: string;
        thumbnail?: string;
        storageId?: Id<"_storage">;
        mimeType?: string;
      }>;
      citations?: Array<Citation>;
      metadata?: {
        tokenCount?: number;
        reasoningTokenCount?: number;
        finishReason?: string;
        duration?: number;
        stopped?: boolean;
      };
    }>) {
      // Skip empty messages and system messages (these are not user-facing)
      if (
        !message.content ||
        message.role === "system" ||
        message.role === "context"
      ) {
        continue;
      }

      // Process attachments - upload base64 content to Convex storage
      let processedAttachments = message.attachments;
      if (message.attachments && message.attachments.length > 0) {
        processedAttachments = await processAttachmentsForStorage(
          ctx,
          message.attachments
        );
      }

      await ctx.runMutation(api.messages.create, {
        conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        provider: message.provider,
        reasoning: message.reasoning,
        attachments: processedAttachments,
        metadata: message.metadata,
        isMainBranch: true,
      });

      // If the message has citations, we need to update it after creation
      // since citations aren't in the create args
      if (message.citations && message.citations.length > 0) {
        const createdMessages = await ctx.runQuery(
          api.messages.getAllInConversation,
          { conversationId }
        );
        const lastMessage = createdMessages[createdMessages.length - 1];
        if (lastMessage) {
          await ctx.runMutation(internal.messages.internalUpdate, {
            id: lastMessage._id,
            citations: message.citations,
          });
        }
      }
    }

    // Mark conversation as not streaming since all messages are already complete
    await ctx.runMutation(api.conversations.patch, {
      id: conversationId,
      updates: { isStreaming: false },
      setUpdatedAt: true,
    });

    // Schedule title generation if not provided
    if (!args.title) {
      await ctx.scheduler.runAfter(100, api.titleGeneration.generateTitle, {
        conversationId,
        message: args.messages[0].content,
      });
    }

    return conversationId;
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsSchema,
    // Filter options
    includeArchived: v.optional(v.boolean()),
    // Specific filter options
    archivedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Use getAuthUserId to properly handle both anonymous and authenticated users
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    // Start with the base query for all conversations
    let query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .order("desc");

    // Apply specific filters first
    if (args.archivedOnly === true) {
      query = query.filter(q => q.eq(q.field("isArchived"), true));
    }

    // Apply include/exclude filters
    if (args.includeArchived === false) {
      query = query.filter(q => q.eq(q.field("isArchived"), false));
    }

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    return validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.take(100);
  },
});

export const search = query({
  args: {
    searchQuery: v.string(),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    if (!args.searchQuery.trim()) {
      return [];
    }

    const conversations = await ctx.db
      .query("conversations")
      .withSearchIndex("search_title", q =>
        q
          .search("title", args.searchQuery)
          .eq("userId", userId)
          .eq("isArchived", args.includeArchived === false ? false : undefined)
      )
      .collect();

    // Apply limit if specified
    const limit = args.limit || 50;
    return conversations.slice(0, limit);
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);
    if (!conversation) {
      return null;
    }
    return conversation;
  },
});

export const getForExport = query({
  args: {
    id: v.string(),
    limit: v.optional(v.number()), // Limit number of messages to reduce bandwidth
  },
  handler: async (ctx, args) => {
    try {
      const conversationId = args.id as Id<"conversations">;
      const conversation = await ctx.db.get(conversationId);

      if (!conversation) {
        return null;
      }

      // Use take() to limit results and avoid loading massive conversations
      const messagesQuery = ctx.db
        .query("messages")
        .withIndex("by_conversation", q =>
          q.eq("conversationId", conversationId)
        )
        .filter(q => q.eq(q.field("isMainBranch"), true))
        .order("asc");

      const messages = args.limit
        ? await messagesQuery.take(args.limit)
        : await messagesQuery.collect();

      // Strip heavy fields for export to reduce bandwidth
      const optimizedMessages = messages.map(message => ({
        _id: message._id,
        _creationTime: message._creationTime,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        provider: message.provider,
        parentId: message.parentId,
        isMainBranch: message.isMainBranch,
        createdAt: message.createdAt,
        // Only include citations, skip heavy attachments and metadata for export
        ...(message.citations && { citations: message.citations }),
      }));

      return {
        conversation,
        messages: optimizedMessages,
      };
    } catch {
      return null;
    }
  },
});

export const patch = mutation({
  args: {
    id: v.id("conversations"),
    updates: v.any(),
    setUpdatedAt: v.optional(v.boolean()),
  },
  handler: (ctx, args) => {
    const patch: Record<string, unknown> = { ...args.updates };
    if (args.setUpdatedAt) {
      patch.updatedAt = Date.now();
    }
    return ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    // Get conversation to find userId for cache invalidation
    const conversation = await ctx.db.get(args.id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // First, ensure streaming is stopped for this conversation
    try {
      await ctx.db.patch(args.id, {
        isStreaming: false,
      });
    } catch (error) {
      console.warn(
        `Failed to clear streaming state for conversation ${args.id}:`,
        error
      );
    }

    // Get all messages in the conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", args.id))
      .collect();

    // Use the messages.removeMultiple mutation which handles attachments and streaming
    if (messages.length > 0) {
      const messageIds = messages.map(m => m._id);
      // We'll delete messages in batches to avoid potential timeouts
      for (let i = 0; i < messageIds.length; i += MESSAGE_BATCH_SIZE) {
        const batch = messageIds.slice(i, i + MESSAGE_BATCH_SIZE);
        await ctx.runMutation(api.messages.removeMultiple, { ids: batch });
      }
    }

    // Delete the conversation
    const result = await ctx.db.delete(args.id);

    // Use atomic decrement for conversation count
    const user = await ctx.db.get(conversation.userId);
    if (user) {
      await ctx.db.patch(user._id, {
        conversationCount: Math.max(0, (user.conversationCount || 0) - 1),
      });
    }

    return result;
  },
});

export const bulkRemove = mutation({
  args: { ids: v.array(v.id("conversations")) },
  handler: async (ctx, args) => {
    const SYNC_THRESHOLD = 10; // Process up to 10 conversations synchronously

    // For small numbers of conversations, process synchronously
    if (args.ids.length <= SYNC_THRESHOLD) {
      const results = [];
      for (const id of args.ids) {
        // Get conversation to find userId for cache invalidation
        const conversation = await ctx.db.get(id);
        if (!conversation) {
          results.push({ id, status: "not_found" });
          continue;
        }

        // First, ensure streaming is stopped for this conversation
        try {
          await ctx.db.patch(id, {
            isStreaming: false,
          });
        } catch (error) {
          console.warn(
            `Failed to clear streaming state for conversation ${id}:`,
            error
          );
        }

        // Get all messages in the conversation
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q => q.eq("conversationId", id))
          .collect();

        // Use the messages.removeMultiple mutation which handles attachments and streaming
        if (messages.length > 0) {
          const messageIds = messages.map(m => m._id);
          // We'll delete messages in batches to avoid potential timeouts
          for (let i = 0; i < messageIds.length; i += MESSAGE_BATCH_SIZE) {
            const batch = messageIds.slice(i, i + MESSAGE_BATCH_SIZE);
            await ctx.runMutation(api.messages.removeMultiple, { ids: batch });
          }
        }

        // Delete the conversation
        await ctx.db.delete(id);

        // Use atomic decrement for conversation count
        // Note: Message count is already decremented in messages.removeMultiple
        const user = await ctx.db.get(conversation.userId);
        if (user) {
          await ctx.db.patch(user._id, {
            conversationCount: Math.max(0, (user.conversationCount || 0) - 1),
          });
        }
        results.push({ id, status: "deleted" });
      }
      return results;
    }

    // For large numbers of conversations, delegate to background job
    throw new Error(
      "Too many conversations to delete at once. Please use the background deletion feature."
    );
  },
});

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
    await ctx.scheduler.runAfter(100, api.conversationImport.processImport, {
      conversations: args.conversations,
      importId: args.importId,
      skipDuplicates: true,
      userId,
    });

    return { importId: args.importId, status: "scheduled" };
  },
});

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
      (conv: Doc<"conversations"> | null) => conv && conv.userId === userId
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
    await ctx.scheduler.runAfter(100, api.conversations.processBulkDelete, {
      conversationIds: args.conversationIds,
      jobId: args.jobId,
      userId,
    });

    return { jobId: args.jobId, status: "scheduled" };
  },
});

// Process a scheduled bulk delete job
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
            api.conversations.bulkRemove,
            {
              ids: batch,
            }
          );

          const deletedCount = batchResult.filter(
            (result: { id: Id<"conversations">; status: string }) =>
              result.status === "deleted"
          ).length;
          totalDeleted += deletedCount;
          errors.push(
            ...batchResult
              .filter(
                (result: { id: Id<"conversations">; status: string }) =>
                  result.status !== "deleted"
              )
              .map(
                (result: { id: Id<"conversations">; status: string }) =>
                  `Failed to delete conversation ${result.id}`
              )
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

      // Save final result
      await ctx.runMutation(api.backgroundJobs.saveImportResult, {
        jobId: args.jobId,
        result: {
          totalImported: totalDeleted,
          totalProcessed: args.conversationIds.length,
          errors,
        },
        status: "completed",
      });

      return { success: true, totalDeleted };
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

export const sendFollowUpMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.string(),
    provider: v.string(),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    userMessageId: Id<"messages">;
    assistantMessageId: Id<"messages">;
  }> => {
    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Process attachments if provided
    const processedAttachments =
      args.attachments && args.attachments.length > 0
        ? await processAttachmentsForStorage(ctx, args.attachments)
        : undefined;

    // Create user message and increment count in a single batch
    const userMessageId = await ctx.runMutation(
      api.messages.createUserMessageBatched,
      {
        conversationId: args.conversationId,
        content: args.content,
        model: args.model,
        provider: args.provider,
        attachments: processedAttachments,
        useWebSearch: args.useWebSearch,
        reasoningConfig: args.reasoningConfig,
      }
    );

    // Build context messages
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
    });

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: args.conversationId,
      model: args.model,
      provider: args.provider,
      userMessageId,
      conversation,
      contextMessages,
      useWebSearch: args.useWebSearch,
      reasoningConfig: args.reasoningConfig,
    });

    return {
      userMessageId,
      assistantMessageId: result.assistantMessageId,
    };
  },
});

export const retryFromMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    retryType: v.union(v.literal("user"), v.literal("assistant")),
    model: v.string(),
    provider: v.string(),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ assistantMessageId: Id<"messages"> }> => {
    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Get all messages for the conversation
    const messagesResult = await ctx.runQuery(api.messages.list, {
      conversationId: args.conversationId,
    });

    // Handle pagination result - if no pagination options passed, result is array
    const messages = Array.isArray(messagesResult)
      ? messagesResult
      : messagesResult.page;

    // Find the target message
    const messageIndex = messages.findIndex(msg => msg._id === args.messageId);
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    let contextEndIndex: number;
    let useWebSearch: boolean | undefined;

    if (args.retryType === "user") {
      // Retry from user message - include the user message and regenerate assistant response
      contextEndIndex = messageIndex;
      useWebSearch = messages[messageIndex].useWebSearch;
    } else {
      // Retry from assistant message - go back to previous user message
      const previousUserMessageIndex = messageIndex - 1;
      const previousUserMessage = messages[previousUserMessageIndex];

      if (!previousUserMessage || previousUserMessage.role !== "user") {
        throw new Error("Cannot find previous user message to retry from");
      }

      contextEndIndex = previousUserMessageIndex;
      useWebSearch = previousUserMessage.useWebSearch;
    }

    // Delete messages after the context end point
    await deleteMessagesAfterIndex(
      ctx,
      messages as import("./lib/conversation_utils").MessageDoc[],
      contextEndIndex
    );

    // Build context messages up to the retry point
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
      includeUpToIndex: contextEndIndex,
    });

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: args.conversationId,
      model: args.model,
      provider: args.provider,
      conversation,
      contextMessages,
      useWebSearch,
      reasoningConfig: args.reasoningConfig,
    });

    return {
      assistantMessageId: result.assistantMessageId,
    };
  },
});

export const editMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    newContent: v.string(),
    model: v.string(),
    provider: v.string(),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ assistantMessageId: Id<"messages"> }> => {
    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Get all messages for the conversation
    const messagesResult = await ctx.runQuery(api.messages.list, {
      conversationId: args.conversationId,
    });

    // Handle pagination result - if no pagination options passed, result is array
    const messages = Array.isArray(messagesResult)
      ? messagesResult
      : messagesResult.page;

    // Find the target message and validate it's a user message
    const messageIndex = messages.findIndex(msg => msg._id === args.messageId);
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    const targetMessage = messages[messageIndex];
    if (targetMessage.role !== "user") {
      throw new Error("Can only edit user messages");
    }

    // Store the original web search setting before deleting messages
    const useWebSearch = targetMessage.useWebSearch;

    // Update the message content
    await ctx.runMutation(api.messages.update, {
      id: args.messageId,
      content: args.newContent,
    });

    // Delete all messages after the edited message
    await deleteMessagesAfterIndex(
      ctx,
      messages as import("./lib/conversation_utils").MessageDoc[],
      messageIndex
    );

    // Build context messages including the edited message
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
    });

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: args.conversationId,
      model: args.model,
      provider: args.provider,
      conversation,
      contextMessages,
      useWebSearch,
      reasoningConfig: args.reasoningConfig,
    });

    return {
      assistantMessageId: result.assistantMessageId,
    };
  },
});

export const stopGeneration = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<{ stopped: boolean }> => {
    try {
      // Get all messages for the conversation to find the currently streaming one
      const messagesResult = await ctx.runQuery(api.messages.list, {
        conversationId: args.conversationId,
      });

      // Handle pagination result - if no pagination options passed, result is array
      const messages = Array.isArray(messagesResult)
        ? messagesResult
        : messagesResult.page;

      // Find the most recent assistant message that might be streaming
      // Cast through unknown to handle citation type differences between pagination result and MessageDoc
      const streamingMessage = findStreamingMessage(
        messages as unknown as MessageDoc[]
      );

      if (streamingMessage) {
        // Stop the streaming for this specific message
        // This will also clear the conversation streaming state
        await ctx.runAction(api.ai.stopStreaming, {
          messageId: streamingMessage._id,
        });
      } else {
        // No streaming message found, but clear the conversation state anyway
        await ensureStreamingCleared(ctx, args.conversationId);
      }

      return {
        stopped: true,
      };
    } catch (error) {
      // Still try to clear streaming state even if stopping failed
      await ensureStreamingCleared(ctx, args.conversationId);
      throw error;
    }
  },
});

export const resumeConversation = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<{ resumed: boolean }> => {
    // Get all messages for the conversation
    const messagesResult = await ctx.runQuery(api.messages.list, {
      conversationId: args.conversationId,
    });

    // Handle pagination result - if no pagination options passed, result is array
    const messages = Array.isArray(messagesResult)
      ? messagesResult
      : messagesResult.page;

    if (messages.length === 0) {
      return { resumed: false };
    }

    // Check if the last message is a user message (indicating an interrupted conversation)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return { resumed: false };
    }

    // Check if there's already a response being generated
    const hasStreamingMessage = messages
      .filter(msg => msg.role === "assistant")
      .some(msg => !msg.metadata?.finishReason);

    if (hasStreamingMessage) {
      return { resumed: false };
    }

    // Get the persona for this conversation if it exists
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Build context messages
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
    });

    // Get user's selected model
    const userModel = await ctx.runQuery(api.userModels.getUserSelectedModel);

    if (!userModel) {
      throw new Error("No model selected for user");
    }

    // Setup and start streaming
    await setupAndStartStreaming(ctx, {
      conversationId: args.conversationId,
      contextMessages,
      model: userModel.modelId,
      provider: userModel.provider,
      userId: conversation.userId,
      useWebSearch: lastMessage.useWebSearch,
    });

    return { resumed: true };
  },
});

export const incrementUserMessageStatsAction = action({
  args: {
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await incrementUserMessageStats(ctx, args.provider);
  },
});
