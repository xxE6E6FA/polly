import { getAuthUserId } from "@convex-dev/auth/server";
import {
  DEFAULT_BUILTIN_MODEL_ID,
  MESSAGE_BATCH_SIZE,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  buildContextMessages,
  checkConversationAccess,
  deleteMessagesAfterIndex,
  executeStreamingAction,
  incrementUserMessageStats,
  processAttachmentsForStorage,
} from "./lib/conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "./lib/model_resolution";
import {
  createEmptyPaginationResult,
  paginationOptsSchema,
  validatePaginationOpts,
} from "./lib/pagination";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  messageRoleSchema,
  modelProviderArgs,
  providerSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";
import { abortStream, isConversationStreaming } from "./lib/streaming_utils";
import type { Citation } from "./types";

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    firstMessage: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Determine search availability based on user authentication
    const authUserId = await getAuthUserId(ctx);
    const useWebSearch = !!authUserId; // Search enabled only for authenticated users

    console.log(
      "[web_search_debug] createConversation - useWebSearch:",
      useWebSearch,
      "for user:",
      authUserId
    );

    // Development mode logging (always enabled for now to debug streaming issues)
    // biome-ignore lint/suspicious/noExplicitAny: Logging data can be various types
    const log = (step: string, data?: any) => {
      console.log(
        `[CREATE_CONVERSATION] ${step}:`,
        data ? JSON.stringify(data, null, 2) : ""
      );
    };

    log("CREATE_CONVERSATION_START", {
      title: args.title,
      firstMessage: args.firstMessage
        ? `${args.firstMessage.substring(0, 100)}...`
        : "empty",
      hasAttachments: !!args.attachments?.length,
      model: args.model,
      provider: args.provider,
    });

    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    log("USER_AUTH_CHECK", { userId: !!userId });
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const user = await ctx.db.get(userId);
    log("USER_FETCH", { hasUser: !!user });
    if (!user) {
      throw new Error("User not found");
    }

    // Get user's effective model with full capabilities
    console.log("[CREATE_CONVERSATION] About to resolve model with args:", {
      model: args.model,
      provider: args.provider,
    });
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );
    console.log("[CREATE_CONVERSATION] Resolved model:", {
      fullModel,
    });

    // Check if this is a built-in free model and enforce limits
    // If model has 'free' field, it's from builtInModels table and is a built-in model
    const isBuiltInModelResult = fullModel.free === true;
    log("BUILTIN_MODEL_CHECK", {
      isBuiltInModel: isBuiltInModelResult,
      hasUnlimitedCalls: user.hasUnlimitedCalls,
    });

    if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
      const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
      const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
      log("MONTHLY_LIMIT_CHECK", {
        monthlyLimit,
        monthlyMessagesSent,
        withinLimit: monthlyMessagesSent < monthlyLimit,
      });
      if (monthlyMessagesSent >= monthlyLimit) {
        throw new Error("Monthly built-in model message limit reached.");
      }
    }

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title || "New Conversation",
      userId: user._id,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: false,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    log("CONVERSATION_CREATED", { conversationId });

    await ctx.db.patch(user._id, {
      conversationCount: Math.max(0, (user.conversationCount || 0) + 1),
    });

    // Create user message (count this one)
    const userMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.firstMessage,
      attachments: args.attachments,
      reasoningConfig: args.reasoningConfig,
      isMainBranch: true,
      createdAt: Date.now(),
      metadata:
        args.temperature !== undefined
          ? { temperature: args.temperature }
          : undefined,
    });
    log("USER_MESSAGE_CREATED", { userMessageId });

    // Only increment stats if this is a new conversation with a first message
    // (not for private conversation imports which have pre-existing messages)
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      await incrementUserMessageStats(ctx, fullModel.free === true);
      log("USER_STATS_INCREMENTED");
    }

    // Create empty assistant message for streaming (don't count assistant messages)
    const assistantMessageId: Id<"messages"> = await ctx.runMutation(
      api.messages.create,
      {
        conversationId,
        role: "assistant",
        content: "",
        status: "thinking",
        model: fullModel.modelId,
        provider: fullModel.provider,
      }
    );
    log("ASSISTANT_MESSAGE_CREATED", { assistantMessageId });

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
      log("TITLE_GENERATION_SCHEDULED");
    }

    // **CRITICAL**: Trigger streaming for the assistant response!
    // We need to start streaming after creating the assistant message
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      log("TRIGGERING_STREAMING", {
        assistantMessageId,
        reasoningConfig: args.reasoningConfig,
      });

      // Schedule streaming generation action for real-time updates
      await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
        messageId: assistantMessageId,
        conversationId,
        model: fullModel, // Pass the full model object
        personaId: args.personaId,
        reasoningConfig: args.reasoningConfig,
        // Include generation parameters that might be passed through
        temperature: args.temperature,
        maxTokens: undefined,
        topP: undefined,
        frequencyPenalty: undefined,
        presencePenalty: undefined,
        useWebSearch, // Pass the search availability determined by user auth
      });

      log("STREAMING_SCHEDULED_SUCCESSFULLY");
    } else {
      log("STREAMING_SKIPPED", { reason: "No first message" });
    }

    return {
      conversationId,
      userMessageId,
      assistantMessageId,
      user,
    };
  },
});

/**
 * Send a message with dynamic model and persona selection (moved from agent_conversations)
 */
export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("image"),
            v.literal("pdf"),
            v.literal("text")
          ),
          url: v.string(),
          name: v.string(),
          size: v.number(),
          content: v.optional(v.string()),
          thumbnail: v.optional(v.string()),
          storageId: v.optional(v.id("_storage")),
        })
      )
    ),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    // Removed useWebSearch and webSearchMaxResults - determined by user auth status
  },
  returns: v.object({
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    userMessageId: Id<"messages">;
    assistantMessageId: Id<"messages">;
  }> => {
    // Determine search availability based on user authentication
    const authUserId = await getAuthUserId(ctx);
    const useWebSearch = !!authUserId; // Search enabled only for authenticated users

    console.log(
      "[web_search_debug] sendMessage - useWebSearch:",
      useWebSearch,
      "for user:",
      authUserId
    );

    // Get user's effective model with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Store attachments as-is during message creation
    // PDF text extraction will happen during assistant response with progress indicators
    const processedAttachments = args.attachments;

    // Create user message
    const userMessageId: Id<"messages"> = await ctx.runMutation(
      api.messages.create,
      {
        conversationId: args.conversationId,
        role: "user",
        content: args.content,
        attachments: processedAttachments,
        reasoningConfig: args.reasoningConfig,
        model: fullModel.modelId,
        provider: fullModel.provider,
        metadata:
          args.temperature !== undefined
            ? { temperature: args.temperature }
            : undefined,
      }
    );

    // The streaming state will be tracked via message status rather than conversation flag

    // Create assistant placeholder with thinking status
    const assistantMessageId: Id<"messages"> = await ctx.runMutation(
      api.messages.create,
      {
        conversationId: args.conversationId,
        role: "assistant",
        content: "",
        status: "thinking",
        model: fullModel.modelId,
        provider: fullModel.provider,
      }
    );

    // Start streaming response
    console.log(
      "[web_search_debug] Scheduling streamResponse - search determined by user auth status"
    );
    await ctx.scheduler.runAfter(0, internal.ai.messages.streamResponse, {
      messageId: assistantMessageId,
      conversationId: args.conversationId,
      model: fullModel, // Pass the full model object
      personaId: args.personaId,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      frequencyPenalty: args.frequencyPenalty,
      presencePenalty: args.presencePenalty,
      useWebSearch, // Pass the search availability determined by user auth
    });

    return { userMessageId, assistantMessageId };
  },
});

export const savePrivateConversation = action({
  args: {
    messages: v.array(
      v.object({
        role: messageRoleSchema,
        content: v.string(),
        createdAt: v.number(),
        model: v.optional(v.string()),
        provider: v.optional(providerSchema),
        reasoning: v.optional(v.string()),
        attachments: v.optional(v.array(attachmentSchema)),
        citations: v.optional(v.array(webCitationSchema)),
        metadata: v.optional(extendedMessageMetadataSchema),
      })
    ),
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
  },
  handler: async (ctx, args): Promise<Id<"conversations">> => {
    // Get authenticated user - this is the correct pattern for actions
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const user = await ctx.runQuery(api.users.getById, { id: userId });
    if (!user) {
      throw new Error("User not found");
    }

    // Block anonymous users from saving private conversations
    if (user.isAnonymous) {
      throw new Error("Anonymous users cannot save private conversations.");
    }
    // Generate a title from the first user message or use provided title
    const conversationTitle = args.title || "New conversation";

    // Create the conversation (without any initial messages since we'll add them manually)
    const conversationId = await ctx.runMutation(
      internal.conversations.createEmptyInternal,
      {
        title: conversationTitle,
        userId: user._id,
        personaId: args.personaId,
      }
    );

    // Extract model/provider from the first user message for stats tracking
    // Only increment stats once for the entire conversation, not per message
    const firstUserMessage = args.messages.find(msg => msg.role === "user");
    if (firstUserMessage?.model && firstUserMessage?.provider) {
      try {
        // Check if this is a built-in model
        const model = await ctx.runQuery(api.userModels.getModelByID, {
          modelId: firstUserMessage.model,
          provider: firstUserMessage.provider,
        });
        await incrementUserMessageStats(ctx, model?.free === true);
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
        message.content.trim() === "" ||
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
    await ctx.runMutation(internal.conversations.internalPatch, {
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
    const { hasAccess, conversation } = await checkConversationAccess(
      ctx,
      args.id,
      true
    );
    if (!hasAccess) {
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
      const { hasAccess, conversation } = await checkConversationAccess(
        ctx,
        conversationId,
        true
      );

      if (!(hasAccess && conversation)) {
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
  handler: async (ctx, args) => {
    // Check access to the conversation (no shared access for mutations)
    const { hasAccess } = await checkConversationAccess(ctx, args.id, false);
    if (!hasAccess) {
      throw new Error("Access denied");
    }

    const patch: Record<string, unknown> = { ...args.updates };
    if (args.setUpdatedAt) {
      patch.updatedAt = Date.now();
    }
    return ctx.db.patch(args.id, patch);
  },
});

// Internal mutation for system operations like title generation
export const internalPatch = internalMutation({
  args: {
    id: v.id("conversations"),
    updates: v.any(),
    setUpdatedAt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if conversation exists before patching
    const conversation = await ctx.db.get(args.id);
    if (!conversation) {
      console.log(
        "[internalPatch] Conversation not found, id:",
        args.id,
        "- likely already deleted"
      );
      return; // Return silently instead of throwing
    }

    const patch: Record<string, unknown> = { ...args.updates };
    if (args.setUpdatedAt) {
      patch.updatedAt = Date.now();
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const internalGet = internalQuery({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createWithUserId = internalMutation({
  args: {
    title: v.optional(v.string()),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    firstMessage: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.optional(v.string()),
    provider: v.optional(providerSchema),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title || "New Conversation",
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.userId, {
      conversationCount: Math.max(0, (user.conversationCount || 0) + 1),
    });

    // Create user message
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
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      await incrementUserMessageStats(ctx);
    }

    // Create empty assistant message for streaming
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      model: args.model,
      provider: args.provider,
      isMainBranch: true,
      createdAt: Date.now(),
    });

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

export const createEmptyInternal = internalMutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Create empty conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      personaId: args.personaId,
      isStreaming: false,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.userId, {
      conversationCount: Math.max(0, (user.conversationCount || 0) + 1),
    });

    return conversationId;
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    // Check access to the conversation (no shared access for mutations)
    const { hasAccess, conversation } = await checkConversationAccess(
      ctx,
      args.id,
      false
    );
    if (!(hasAccess && conversation)) {
      throw new Error("Access denied");
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
    const user = await ctx.db.get(conversation?.userId);
    if (user && "conversationCount" in user) {
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
        // Check access to the conversation (no shared access for mutations)
        const { hasAccess, conversation } = await checkConversationAccess(
          ctx,
          id,
          false
        );
        if (!(hasAccess && conversation)) {
          results.push({ id, status: "access_denied" });
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
        const user = await ctx.db.get(conversation?.userId);
        if (user && "conversationCount" in user) {
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

export const editAndResendMessage = action({
  args: {
    messageId: v.id("messages"),
    newContent: v.string(),
    ...modelProviderArgs,
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    webSearchMaxResults: v.optional(v.number()),
  },
  returns: v.object({
    assistantMessageId: v.id("messages"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ assistantMessageId: Id<"messages"> }> => {
    // Get the message to find the conversation
    const message = await ctx.runQuery(api.messages.getById, {
      id: args.messageId,
    });
    if (!message) {
      throw new Error("Message not found");
    }

    if (message.role !== "user") {
      throw new Error("Can only edit user messages");
    }

    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const conversation = await ctx.runQuery(api.conversations.get, {
      id: message.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Get all messages for the conversation
    const messagesResult = await ctx.runQuery(api.messages.list, {
      conversationId: message.conversationId,
    });

    const messages = Array.isArray(messagesResult)
      ? messagesResult
      : messagesResult.page;

    const messageIndex = messages.findIndex(
      (msg: Doc<"messages">) => msg._id === args.messageId
    );
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    // Update the message content
    await ctx.runMutation(api.messages.update, {
      id: args.messageId,
      content: args.newContent,
    });

    // Delete all messages after the edited message
    await handleMessageDeletion(ctx, messages, messageIndex, "user");

    // Build context messages including the edited message
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: message.conversationId,
      personaId: conversation.personaId,
    });

    // Get user's effective model using centralized resolution with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: message.conversationId,
      model: fullModel.modelId,
      provider: fullModel.provider,
      conversation,
      contextMessages,
      useWebSearch: true, // Retry operations are always from authenticated users
      reasoningConfig: args.reasoningConfig,
    });

    return {
      assistantMessageId: result.assistantMessageId,
    };
  },
});

// Helper function to handle message deletion logic for retry and edit operations
const handleMessageDeletion = async (
  ctx: ActionCtx,
  messages: Doc<"messages">[],
  messageIndex: number,
  retryType: "user" | "assistant"
) => {
  if (retryType === "assistant") {
    // For assistant retry, delete the assistant message itself AND everything after it
    const messagesToDelete = messages.slice(messageIndex);
    for (const msg of messagesToDelete) {
      await ctx.runMutation(api.messages.remove, { id: msg._id });
    }
  } else {
    // For user retry, delete messages after the user message (but keep the user message)
    await deleteMessagesAfterIndex(
      ctx,
      messages as import("./lib/conversation_utils").MessageDoc[],
      messageIndex
    );
  }
};

export const retryFromMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    retryType: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
    ...modelProviderArgs,
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
    const messageIndex = messages.findIndex(
      (msg: Doc<"messages">) => msg._id === args.messageId
    );
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    const targetMessage = messages[messageIndex] as Doc<"messages">;

    // Determine retry type automatically if not provided
    const retryType =
      args.retryType || (targetMessage.role === "user" ? "user" : "assistant");

    let contextEndIndex: number;

    if (retryType === "user") {
      // Retry from user message - keep the user message and regenerate assistant response
      contextEndIndex = messageIndex;
    } else {
      // Retry from assistant message - go back to the previous user message for context
      const previousUserMessageIndex = messageIndex - 1;
      const previousUserMessage = messages[previousUserMessageIndex];

      if (!previousUserMessage || previousUserMessage.role !== "user") {
        throw new Error("Cannot find previous user message to retry from");
      }

      contextEndIndex = previousUserMessageIndex;
    }

    // Handle message deletion based on retry type
    await handleMessageDeletion(ctx, messages, messageIndex, retryType);

    // Build context messages up to the retry point
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
      includeUpToIndex: contextEndIndex,
    });

    // Get user's effective model using centralized resolution with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: args.conversationId,
      model: fullModel.modelId,
      provider: fullModel.provider,
      conversation,
      contextMessages,
      useWebSearch: true, // Retry operations are always from authenticated users
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
    ...modelProviderArgs,
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
    const messageIndex = messages.findIndex(
      (msg: Doc<"messages">) => msg._id === args.messageId
    );
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    const targetMessage = messages[messageIndex];
    if (targetMessage.role !== "user") {
      throw new Error("Can only edit user messages");
    }

    // Store the original web search setting before deleting messages
    // Update the message content
    await ctx.runMutation(api.messages.update, {
      id: args.messageId,
      content: args.newContent,
    });

    // Delete all messages after the edited message (use user retry logic)
    await handleMessageDeletion(ctx, messages, messageIndex, "user");

    // Build context messages including the edited message
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
    });

    // Get user's effective model using centralized resolution with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Execute streaming action
    const result = await executeStreamingAction(ctx, {
      conversationId: args.conversationId,
      model: fullModel.modelId,
      provider: fullModel.provider,
      conversation,
      contextMessages,
      useWebSearch: true, // Retry operations are always from authenticated users
      reasoningConfig: args.reasoningConfig,
    });

    return {
      assistantMessageId: result.assistantMessageId,
    };
  },
});

export const stopGeneration = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    console.log(
      `[stopGeneration] Stopping generation for conversation: ${args.conversationId}`
    );

    // First, try to abort any active in-memory streams
    const wasAborted = abortStream(args.conversationId);

    // Also mark the conversation as not streaming to signal completion
    await ctx.db.patch(args.conversationId, {
      isStreaming: false,
    });

    // Also mark any streaming message as stopped by finding the most recent assistant message
    const recentAssistantMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", args.conversationId)
      )
      .filter(q => q.eq(q.field("role"), "assistant"))
      .order("desc")
      .first();

    if (recentAssistantMessage) {
      const metadata = recentAssistantMessage.metadata as
        | Record<string, unknown>
        | null
        | undefined;
      // If the message doesn't have a finishReason, it's likely streaming
      if (!(metadata?.finishReason || metadata?.stopped)) {
        console.log(
          `[stopGeneration] Marking message ${recentAssistantMessage._id} as stopped`
        );
        await ctx.db.patch(recentAssistantMessage._id, {
          metadata: {
            ...metadata,
            finishReason: "stop",
            stopped: true,
          },
        });
      }
    }

    const hasRecentMessage = Boolean(recentAssistantMessage);
    if (!(wasAborted || hasRecentMessage)) {
      console.warn(
        `[stopGeneration] No active stream or streaming message found for conversation ${args.conversationId}`
      );
    }
  },
});

export const createBranchingConversation = action({
  args: {
    userId: v.optional(v.id("users")),
    firstMessage: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
    personaId: v.optional(v.id("personas")),
    personaPrompt: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    generateTitle: v.optional(v.boolean()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    contextSummary: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    conversationId: Id<"conversations">;
    userId: Id<"users">;
    isNewUser: boolean;
  }> => {
    // Get authenticated user ID first
    let authenticatedUserId: Id<"users"> | null = null;
    try {
      authenticatedUserId = await getAuthUserId(ctx);
    } catch (error) {
      console.warn("Failed to get authenticated user:", error);
    }

    // Create user if needed or use provided user ID
    let actualUserId: Id<"users">;
    let isNewUser = false;

    if (args.userId) {
      // Use provided user ID (for background jobs or specific user creation)
      actualUserId = args.userId;
    } else if (authenticatedUserId) {
      // Use authenticated user ID
      actualUserId = authenticatedUserId;
    } else {
      // Create anonymous user as fallback
      actualUserId = await ctx.runMutation(
        internal.users.internalCreateAnonymous
      );
      isNewUser = true;
    }

    // Get user's selected model
    const selectedModel = await ctx.runQuery(
      api.userModels.getUserSelectedModel
    );
    if (!selectedModel) {
      throw new Error("No model selected. Please select a model in Settings.");
    }

    // Check if it's a built-in free model and enforce limits
    // If model has 'free' field, it's from builtInModels table and is a built-in model
    const isBuiltInModelResult = selectedModel.free === true;
    const user = await ctx.runQuery(api.users.getById, { id: actualUserId });
    if (!user) {
      throw new Error("User not found");
    }

    if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
      const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
      const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
      if (monthlyMessagesSent >= monthlyLimit) {
        throw new Error("Monthly built-in model message limit reached.");
      }
    }

    // Fetch persona prompt if personaId is provided but personaPrompt is not
    let finalPersonaPrompt = args.personaPrompt;
    if (args.personaId && !finalPersonaPrompt) {
      const persona = await ctx.runQuery(api.personas.get, {
        id: args.personaId,
      });
      finalPersonaPrompt = persona?.prompt ?? undefined;
    }

    // Provider is already the actual provider - no mapping needed
    const actualProvider = selectedModel.provider as
      | "openai"
      | "anthropic"
      | "google"
      | "openrouter";

    // Create conversation using internal mutation
    const createResult = await ctx.runMutation(
      internal.conversations.createWithUserId,
      {
        title: "New conversation",
        userId: actualUserId,
        personaId: args.personaId,
        sourceConversationId: args.sourceConversationId,
        firstMessage: args.firstMessage,
        attachments: args.attachments,
        useWebSearch: args.useWebSearch,
        model: selectedModel.modelId,
        provider: actualProvider,
        reasoningConfig: args.reasoningConfig,
      }
    );

    // Increment message stats
    await incrementUserMessageStats(ctx, selectedModel.free === true);

    // Create context message if contextSummary is provided
    if (args.sourceConversationId && args.contextSummary) {
      await ctx.runMutation(api.messages.create, {
        conversationId: createResult.conversationId,
        role: "context",
        content: `Context from previous conversation: ${args.contextSummary}`,
        sourceConversationId: args.sourceConversationId,
        isMainBranch: true,
      });
    }

    return {
      conversationId: createResult.conversationId,
      userId: actualUserId,
      isNewUser,
    };
  },
});

import { processAttachmentsForLLM } from "./lib/process_attachments";

/**
 * Wrapper functions for UI compatibility (replaces agent_conversations.ts)
 */

/**
 * Create conversation action wrapper (UI expects this)
 */
export const createConversationAction = action({
  args: {
    title: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    firstMessage: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      conversationId: v.id("conversations"),
      userMessageId: v.id("messages"),
      assistantMessageId: v.id("messages"),
    }),
    v.object({
      conversationId: v.id("conversations"),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    | {
        conversationId: Id<"conversations">;
        userMessageId: Id<"messages">;
        assistantMessageId: Id<"messages">;
      }
    | { conversationId: Id<"conversations"> }
  > => {
    // Get current authenticated user
    const user = await ctx.runQuery(api.users.current);

    if (!user) {
      throw new Error("Not authenticated");
    }

    // If there's a first message, create conversation with it
    if (args.firstMessage) {
      // Resolve the model capabilities to decide on PDF processing
      const _fullModel = await getUserEffectiveModelWithCapabilities(
        ctx,
        args.model,
        args.provider
      );

      // Store attachments as-is during conversation creation
      // PDF text extraction will happen during assistant response with progress indicators
      const processedAttachments = args.attachments;

      const result: {
        conversationId: Id<"conversations">;
        userMessageId: Id<"messages">;
        assistantMessageId: Id<"messages">;
      } = await ctx.runMutation(api.conversations.createConversation, {
        title: args.title,
        personaId: args.personaId,
        firstMessage: args.firstMessage,
        model: args.model || DEFAULT_BUILTIN_MODEL_ID,
        provider:
          (args.provider as
            | "openai"
            | "anthropic"
            | "google"
            | "openrouter"
            | undefined) || "google",
        attachments: processedAttachments,
        reasoningConfig: args.reasoningConfig,
        temperature: args.temperature,
      });

      return {
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
      };
    }

    // Create empty conversation - use internal mutation to create just the conversation
    const conversationId: Id<"conversations"> = await ctx.runMutation(
      internal.conversations.createEmptyInternal,
      {
        title: args.title || "New Conversation",
        userId: user._id,
        personaId: args.personaId,
      }
    );

    return { conversationId };
  },
});

/**
 * Check if a conversation is currently streaming by examining its messages
 */
export const isStreaming = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await isConversationStreaming(ctx, args.conversationId);
  },
});
