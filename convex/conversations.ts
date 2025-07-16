import {
  BATCH_SIZE,
  CHUNK_SIZE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MESSAGE_BATCH_SIZE,
  MONTHLY_MESSAGE_LIMIT,
  WEB_SEARCH_MAX_RESULTS,
} from "@shared/constants";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import {
  createConvexExportData,
  type ExportConversation,
} from "./backgroundJobs";
import { getDefaultSystemPrompt } from "./constants";
import { getCurrentUserId, requireAuth } from "./lib/auth";
import {
  buildUserMessageContent,
  type ConversationDoc,
  deleteMessagesAfterIndex,
  ensureStreamingCleared,
  findStreamingMessage,
  getDefaultSystemPromptForConversation,
  type MessageActionArgs,
  type MessageDoc,
  resolveAttachmentUrls,
  type StreamingActionResult,
} from "./lib/conversation_utils";
import {
  createEmptyPaginationResult,
  paginationOptsSchema,
  validatePaginationOpts,
} from "./lib/pagination";
import {
  attachmentSchema,
  attachmentWithMimeTypeSchema,
  messageRoleSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

// Common helper for streaming action execution
const executeStreamingAction = async (
  ctx: ActionCtx,
  args: MessageActionArgs & {
    userMessageId?: Id<"messages">;
    conversation: ConversationDoc;
    contextMessages: Array<{
      role: "user" | "assistant" | "system";
      content:
        | string
        | Array<{
            type: "text" | "image_url" | "file";
            text?: string;
            image_url?: { url: string };
            file?: { filename: string; file_data: string };
            attachment?: {
              storageId: Id<"_storage">;
              type: string;
              name: string;
            };
          }>;
    }>;
    useWebSearch?: boolean;
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }
): Promise<StreamingActionResult> => {
  let assistantMessageId: Id<"messages"> | undefined;

  try {
    // Setup and start streaming
    assistantMessageId = await setupAndStartStreaming(ctx, {
      conversationId: args.conversationId,
      contextMessages: args.contextMessages,
      model: args.model,
      provider: args.provider,
      userId: args.conversation.userId,
      useWebSearch: args.useWebSearch,
      reasoningConfig: args.reasoningConfig,
    });

    return {
      userMessageId: args.userMessageId,
      assistantMessageId,
    };
  } catch (error) {
    return await handleStreamingError(ctx, error, args.conversationId, {
      userMessageId: args.userMessageId,
      assistantMessageId,
    });
  }
};

// Helper function to process attachments and upload base64 data to Convex storage
const processAttachmentsForStorage = async (
  ctx: ActionCtx,
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    storageId?: Id<"_storage">;
    mimeType?: string;
  }>
): Promise<
  | Array<{
      type: "image" | "pdf" | "text";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
    }>
  | undefined
> => {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  return await Promise.all(
    attachments.map(async attachment => {
      // Check if we need to upload to storage
      const needsUpload =
        (attachment.type === "image" || attachment.type === "pdf") &&
        !attachment.storageId &&
        (attachment.url.startsWith("data:") || attachment.content);

      if (needsUpload) {
        try {
          let mimeType: string;
          let base64Data: string;

          // Handle data URL format
          if (attachment.url.startsWith("data:")) {
            const matches = attachment.url.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              throw new Error("Invalid data URL format");
            }
            mimeType = matches[1];
            base64Data = matches[2];
          }
          // Handle separate content field (from private chat saves)
          else if (attachment.content) {
            mimeType =
              attachment.mimeType ||
              (attachment.type === "image" ? "image/jpeg" : "application/pdf");
            base64Data = attachment.content;
          } else {
            // No data to upload
            return attachment;
          }

          // Convert base64 to blob
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });

          // Upload to Convex storage
          const storageId = await ctx.storage.store(blob);

          // Return attachment with storageId
          return {
            type: attachment.type,
            url: "", // Will be resolved when needed
            name: attachment.name,
            size: attachment.size,
            storageId: storageId as Id<"_storage">,
            thumbnail: attachment.thumbnail,
            content: undefined, // Remove base64 content to save space
          };
        } catch (error) {
          console.error(
            `Failed to upload attachment ${attachment.name}:`,
            error
          );
          // Fall back to original attachment (without mimeType for schema compatibility)
          // biome-ignore lint/correctness/noUnusedVariables: Intentionally destructuring to remove mimeType
          const { mimeType, ...cleanAttachment } = attachment;
          return cleanAttachment;
        }
      }

      // Return as-is if no upload needed (but remove mimeType for schema compatibility)
      // biome-ignore lint/correctness/noUnusedVariables: Intentionally destructuring to remove mimeType
      const { mimeType, ...cleanAttachment } = attachment;
      return cleanAttachment;
    })
  );
};

// Helper function to validate conversation and get API key
const validateConversationAndAuth = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    provider: string;
  }
): Promise<{ conversation: ConversationDoc; apiKey: string }> => {
  // Validate conversation exists
  const conversation = (await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  })) as ConversationDoc | null;

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Get API key for the provider
  const apiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
    provider: args.provider as "openai" | "anthropic" | "google" | "openrouter",
  });

  if (!apiKey) {
    throw new Error(
      `No API key found for ${args.provider}. Please add an API key in Settings.`
    );
  }

  return { conversation, apiKey };
};

// Helper function to build context messages from conversation history
const buildContextMessages = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    personaId?: Id<"personas">;
    includeUpToIndex?: number; // For retry/edit scenarios
  }
) => {
  // Get all messages for context
  const messagesResult = await ctx.runQuery(api.messages.list, {
    conversationId: args.conversationId,
  });

  // Handle pagination result - if no pagination options passed, result is array
  const messages = Array.isArray(messagesResult)
    ? messagesResult
    : messagesResult.page;

  // Slice messages if needed (for retry/edit)
  const relevantMessages =
    args.includeUpToIndex !== undefined
      ? messages.slice(0, args.includeUpToIndex + 1)
      : messages;

  const personaPrompt = args.personaId
    ? (await ctx.runQuery(api.personas.get, { id: args.personaId }))?.prompt
    : undefined;

  // Resolve attachment URLs for messages with storageIds
  const messagesWithResolvedUrls = await Promise.all(
    relevantMessages.map(async msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        const resolvedAttachments = await resolveAttachmentUrls(
          ctx,
          msg.attachments
        );
        return {
          ...msg,
          attachments: resolvedAttachments,
        };
      }
      return msg;
    })
  );

  // Build context messages for the API
  const contextMessagesPromises = messagesWithResolvedUrls
    .filter(msg => msg.role !== "context") // Skip context messages
    .map(async msg => {
      if (msg.role === "system") {
        // Filter out previous citation instructions to avoid duplication
        const isCitationInstruction =
          msg.content.includes("🚨 CRITICAL CITATION REQUIREMENTS") ||
          msg.content.includes("SEARCH RESULTS:") ||
          msg.content.includes("AVAILABLE SOURCES FOR CITATION:");

        if (isCitationInstruction) {
          return undefined; // Skip this message
        }

        return {
          role: "system" as const,
          content: msg.content,
        };
      }

      if (msg.role === "user") {
        const content = await buildUserMessageContent(
          ctx,
          msg.content,
          msg.attachments
        );
        return {
          role: "user" as const,
          content,
        };
      }

      if (msg.role === "assistant") {
        return {
          role: "assistant" as const,
          content: msg.content,
        };
      }

      return;
    });

  const contextMessagesWithNulls = await Promise.all(contextMessagesPromises);
  const contextMessages = contextMessagesWithNulls.filter(
    (msg): msg is Exclude<typeof msg, undefined> => msg !== undefined
  );

  // Always add default system prompt as foundation
  const defaultPrompt = getDefaultSystemPromptForConversation(
    relevantMessages as unknown as MessageDoc[]
  );

  contextMessages.unshift({
    role: "system",
    content: defaultPrompt,
  });

  // Add persona prompt as additional system message if it exists and isn't already in the messages
  // (persona prompts are stored in the database as system messages, so we only add if not already loaded)
  const hasPersonaInMessages = contextMessages.some(
    msg => msg.role === "system" && msg.content === personaPrompt
  );

  if (personaPrompt && !hasPersonaInMessages) {
    // Add persona prompt after default system prompt to maintain consistent order
    contextMessages.splice(1, 0, {
      role: "system",
      content: personaPrompt,
    });
  }

  return { contextMessages, messages: relevantMessages };
};

// Helper function to setup and start streaming
const setupAndStartStreaming = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    contextMessages: Array<{
      role: "user" | "assistant" | "system";
      content:
        | string
        | Array<{
            type: "text" | "image_url" | "file";
            text?: string;
            image_url?: { url: string };
            file?: { filename: string; file_data: string };
            attachment?: {
              storageId: Id<"_storage">;
              type: string;
              name: string;
            };
          }>;
    }>;
    model: string;
    provider: string;
    userId: Id<"users">;
    useWebSearch?: boolean;
    reasoningConfig?: {
      enabled?: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }
) => {
  // Set conversation streaming state
  await ctx.runMutation(api.conversations.setStreamingState, {
    id: args.conversationId,
    isStreaming: true,
  });

  // Create assistant message for streaming
  const assistantMessageId = await ctx.runMutation(api.messages.create, {
    conversationId: args.conversationId,
    role: "assistant",
    content: "",
    model: args.model,
    provider: args.provider,
    isMainBranch: true,
  });

  // Start streaming response
  await ctx.runAction(api.ai.streamResponse, {
    messages: args.contextMessages,
    messageId: assistantMessageId,
    model: args.model,
    provider: args.provider,
    userId: args.userId,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    enableWebSearch: args.useWebSearch,
    webSearchMaxResults: WEB_SEARCH_MAX_RESULTS,
    reasoningConfig: args.reasoningConfig?.enabled
      ? {
          effort: args.reasoningConfig.effort,
          maxTokens: args.reasoningConfig.maxTokens,
        }
      : undefined,
  });

  return assistantMessageId;
};

// Helper function to handle streaming errors
const handleStreamingError = async (
  ctx: ActionCtx,
  error: unknown,
  conversationId: Id<"conversations">,
  messageIds?: {
    userMessageId?: Id<"messages">;
    assistantMessageId?: Id<"messages">;
  }
) => {
  // Clear streaming state on error
  await ctx.runMutation(api.conversations.setStreamingState, {
    id: conversationId,
    isStreaming: false,
  });

  // If stopped by user, this is not an error - just return the message IDs
  if (error instanceof Error && error.message === "StoppedByUser") {
    return {
      userMessageId: messageIds?.userMessageId || ("" as Id<"messages">),
      assistantMessageId:
        messageIds?.assistantMessageId || ("" as Id<"messages">),
    };
  }

  throw error;
};

export const create = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    if (user) {
      await ctx.db.patch(args.userId, {
        conversationCount: (user.conversationCount || 0) + 1,
      });
    }

    return conversationId;
  },
});

// Internal mutation that batches all conversation creation operations
export const createWithMessages = internalMutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
    personaId: v.optional(v.id("personas")),
    sourceConversationId: v.optional(v.id("conversations")),
    firstMessage: v.string(),
    personaPrompt: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    // Check if this is a Polly free model and enforce limits
    const userModel = await ctx.db
      .query("userModels")
      .withIndex("by_user_model_id", q =>
        q.eq("userId", args.userId).eq("modelId", args?.model ?? "")
      )
      .unique();

    const isPollyFree = !!userModel?.free;

    if (isPollyFree && user && !user.hasUnlimitedCalls) {
      const monthlyLimit = user.monthlyLimit ?? 500;
      const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
      if (monthlyMessagesSent >= monthlyLimit) {
        throw new ConvexError("Monthly Polly model message limit reached.");
      }
    }

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Use atomic increment for conversation count
    if (user) {
      await ctx.db.patch(args.userId, {
        conversationCount: (user.conversationCount || 0) + 1,
      });
    }

    // Count user messages we'll create for total message count tracking
    let userMessageCount = 0;

    // Create system message if persona prompt exists (don't count system messages)
    if (args.personaPrompt) {
      await ctx.db.insert("messages", {
        conversationId,
        role: "system",
        content: args.personaPrompt,
        isMainBranch: true,
        createdAt: Date.now(),
      });
    }

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
    userMessageCount++;

    // Use atomic increment for message count (only for Polly-free models)
    if (user && isPollyFree) {
      await ctx.db.patch(args.userId, {
        messagesSent: (user.messagesSent || 0) + 1,
        monthlyMessagesSent: (user.monthlyMessagesSent || 0) + 1,
      });
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

    // Use atomic increment for total message count (only count user messages)
    if (user) {
      await ctx.db.patch(args.userId, {
        totalMessageCount: (user.totalMessageCount || 0) + userMessageCount,
      });
    }

    return {
      conversationId,
      userMessageId,
      assistantMessageId,
    };
  },
});

export const list = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsSchema,
  },
  handler: async (ctx, args) => {
    // Use provided userId or fall back to server-side auth
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userId).eq("isArchived", false)
      )
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    return validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.take(100); // Limit unbounded queries to 100 conversations
  },
});

// Optimized list query that only returns essential fields
export const listOptimized = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsSchema,
  },
  handler: async (ctx, args) => {
    // Use provided userId or fall back to server-side auth
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userId).eq("isArchived", false)
      )
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    const results = validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.take(100); // Limit unbounded queries to 100 conversations

    // Return only essential fields for list display
    const optimizeConversation = (conv: ConversationDoc) => ({
      _id: conv._id,
      _creationTime: conv._creationTime,
      title: conv.title,
      updatedAt: conv.updatedAt,
      isPinned: conv.isPinned,
      isStreaming: conv.isStreaming,
      // Skip: userId, personaId, sourceConversationId, isArchived, createdAt
    });

    if (validatedOpts && "page" in results) {
      return {
        ...results,
        page: results.page.map(optimizeConversation),
      };
    }

    return (results as ConversationDoc[]).map(optimizeConversation);
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getAuthorized = query({
  args: {
    id: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    try {
      // Attempt to use the string as a Convex ID
      // If it's not a valid ID format, ctx.db.get will handle it gracefully
      const conversationId = args.id as Id<"conversations">;
      const conversation = await ctx.db.get(conversationId);

      if (!conversation) {
        return null;
      }

      // Use provided userId or fall back to server-side auth
      const userId = args.userId || (await getCurrentUserId(ctx));

      // If no user is found (neither provided nor authenticated), deny access
      if (!userId) {
        return null;
      }

      // Check if the conversation belongs to the current user
      if (conversation.userId !== userId) {
        return null;
      }

      // Return the conversation including archived ones
      // Frontend will handle read-only mode for archived conversations
      return conversation;
    } catch {
      // Invalid ID format or any other error - return null to trigger 404
      return null;
    }
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    isStreaming: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const conversationId = args.id as Id<"conversations">;
      // biome-ignore lint/correctness/noUnusedVariables: Intentionally destructuring to remove id
      const { id, ...updates } = args;
      return await ctx.db.patch(conversationId, {
        ...updates,
        updatedAt: Date.now(),
      });
    } catch {
      throw new Error("Invalid conversation ID");
    }
  },
});

export const updateTitle = mutation({
  args: {
    id: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const conversationId = args.id as Id<"conversations">;
      // Only update title, don't touch updatedAt to avoid bumping to top
      return await ctx.db.patch(conversationId, {
        title: args.title,
      });
    } catch {
      throw new Error("Invalid conversation ID");
    }
  },
});

export const setPinned = mutation({
  args: {
    id: v.id("conversations"),
    isPinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.id, {
      isPinned: args.isPinned,
      updatedAt: Date.now(),
    });
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

    const userMessageCount = messages.filter(m => m.role === "user").length;
    const user = await ctx.db.get(conversation.userId);

    // Use atomic decrement for conversation count
    if (user) {
      await ctx.db.patch(user._id, {
        conversationCount: (user.conversationCount || 0) - 1,
      });
    }

    // Use atomic decrement for total message count if there are user messages
    if (user && userMessageCount > 0) {
      await ctx.db.patch(user._id, {
        totalMessageCount: (user.totalMessageCount || 0) - userMessageCount,
      });
    }

    return result;
  },
});

export const archive = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    return await ctx.db.patch(args.id, {
      isArchived: true,
      updatedAt: Date.now(),
    });
  },
});

export const unarchive = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    return await ctx.db.patch(args.id, {
      isArchived: false,
      updatedAt: Date.now(),
    });
  },
});

export const listArchived = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsSchema,
  },
  handler: async (ctx, args) => {
    // Use provided userId or fall back to server-side auth
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userId).eq("isArchived", true)
      )
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    return validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.take(100); // Limit unbounded queries to 100 conversations
  },
});

// Dedicated pagination-only queries for usePaginatedQuery
export const listPaginated = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    // Use provided userId or fall back to server-side auth
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return createEmptyPaginationResult();
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", userId).eq("isArchived", false)
      )
      .order("desc");

    return await query.paginate(args.paginationOpts);
  },
});

export const listArchivedPaginated = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Use provided userId or fall back to server-side auth
    const resolvedUserId = args.userId || (await getCurrentUserId(ctx));

    if (!resolvedUserId) {
      return createEmptyPaginationResult();
    }

    return await ctx.db
      .query("conversations")
      .withIndex("by_user_archived", q =>
        q.eq("userId", resolvedUserId).eq("isArchived", true)
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const setStreamingState = mutation({
  args: {
    id: v.id("conversations"),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Direct patch without checking current state
    // Convex handles duplicate writes efficiently
    return await ctx.db.patch(args.id, {
      isStreaming: args.isStreaming,
      updatedAt: Date.now(),
    });
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

// Optimized export function with bandwidth reduction
export const getForExportOptimized = query({
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

// Simplified action for creating new conversations with immediate response
export const createNewConversation = action({
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
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    conversationId: Id<"conversations">;
    userId: Id<"users">;
    isNewUser: boolean;
  }> => {
    // Create user if needed
    const actualUserId: Id<"users"> = args.userId
      ? args.userId
      : await ctx.runMutation(api.users.createAnonymous);

    // Get user's selected model
    const selectedModel = await ctx.runQuery(
      api.userModels.getUserSelectedModel
    );
    if (!selectedModel) {
      throw new Error("No model selected. Please select a model in Settings.");
    }

    // Fetch persona prompt if personaId is provided but personaPrompt is not
    let finalPersonaPrompt = args.personaPrompt;
    if (args.personaId && !finalPersonaPrompt) {
      const persona = await ctx.runQuery(api.personas.get, {
        id: args.personaId,
      });
      finalPersonaPrompt = persona?.prompt ?? undefined;
    }

    // Process attachments - upload base64 content to Convex storage
    let processedAttachments = args.attachments;
    if (args.attachments && args.attachments.length > 0) {
      processedAttachments = await processAttachmentsForStorage(
        ctx,
        args.attachments
      );
    }

    // Batch create conversation and messages in single internal mutation
    const result: {
      conversationId: Id<"conversations">;
      userMessageId: Id<"messages">;
      assistantMessageId: Id<"messages">;
    } = await ctx.runMutation(internal.conversations.createWithMessages, {
      title: "New conversation",
      userId: actualUserId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      firstMessage: args.firstMessage,
      personaPrompt: finalPersonaPrompt,
      attachments: processedAttachments,
      useWebSearch: args.useWebSearch,
      model: selectedModel.modelId,
      provider: selectedModel.provider,
      reasoningConfig: args.reasoningConfig,
    });

    if (args.sourceConversationId) {
      const content = await ctx.runAction(
        api.conversationSummary.generateConversationSummary,
        {
          conversationId: args.sourceConversationId,
          maxTokens: 250,
        }
      );

      if (content) {
        await ctx.runMutation(api.messages.create, {
          conversationId: result.conversationId,
          role: "context",
          content,
          sourceConversationId: args.sourceConversationId,
          isMainBranch: true,
        });
      }
    }

    const contextMessages: Array<{
      role: "user" | "assistant" | "system";
      content:
        | string
        | Array<{
            type: "text" | "image_url" | "file";
            text?: string;
            image_url?: { url: string };
            file?: { filename: string; file_data: string };
            attachment?: {
              storageId: Id<"_storage">;
              type: string;
              name: string;
            };
          }>;
    }> = [];

    // Always add default system prompt as foundation
    const defaultPrompt = getDefaultSystemPrompt(
      selectedModel.name || selectedModel.modelId
    );
    contextMessages.push({
      role: "system",
      content: defaultPrompt,
    });

    // Add persona prompt as additional system message if it exists
    if (finalPersonaPrompt) {
      contextMessages.push({
        role: "system",
        content: finalPersonaPrompt,
      });
    }

    // Add user message with attachments
    const userContent = await buildUserMessageContent(
      ctx,
      args.firstMessage,
      processedAttachments
    );

    contextMessages.push({
      role: "user",
      content: userContent,
    });

    // Schedule AI response
    await ctx.scheduler.runAfter(0, api.ai.streamResponse, {
      messages: contextMessages,
      messageId: result.assistantMessageId,
      model: selectedModel.modelId,
      provider: selectedModel.provider,
      userId: actualUserId,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      enableWebSearch: args.useWebSearch,
      webSearchMaxResults: WEB_SEARCH_MAX_RESULTS,
      reasoningConfig: args.reasoningConfig?.enabled
        ? {
            effort: args.reasoningConfig.effort,
            maxTokens: args.reasoningConfig.maxTokens,
          }
        : undefined,
    });

    // Schedule title generation if requested
    if (args.generateTitle !== false) {
      await ctx.scheduler.runAfter(
        100,
        api.titleGeneration.generateTitleBackground,
        {
          conversationId: result.conversationId,
          message: args.firstMessage,
        }
      );
    }

    return {
      conversationId: result.conversationId,
      userId: actualUserId,
      isNewUser: !args.userId,
    };
  },
});

export const getOrCreateUser = action({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // If we have a userId, verify it exists
    if (args.userId) {
      const user = await ctx.runQuery(api.users.getById, { id: args.userId });
      if (user) {
        return {
          userId: args.userId,
          isNewUser: false,
        };
      }
    }

    // No valid user, create a new anonymous user
    const newUserId: Id<"users"> = await ctx.runMutation(
      api.users.createAnonymous
    );
    return {
      userId: newUserId,
      isNewUser: true,
    };
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
    // Validate conversation and get API key
    const { conversation } = await validateConversationAndAuth(ctx, {
      conversationId: args.conversationId,
      provider: args.provider,
    });

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
    // Validate conversation and get API key
    const { conversation } = await validateConversationAndAuth(ctx, {
      conversationId: args.conversationId,
      provider: args.provider,
    });

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
      messages as MessageDoc[],
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
    // Validate conversation and get API key
    const { conversation } = await validateConversationAndAuth(ctx, {
      conversationId: args.conversationId,
      provider: args.provider,
    });

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
    await deleteMessagesAfterIndex(ctx, messages as MessageDoc[], messageIndex);

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

// Action to save a private conversation with all its messages
export const savePrivateConversation = action({
  args: {
    userId: v.id("users"),
    messages: v.array(
      v.object({
        role: messageRoleSchema,
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
    // Block anonymous users from saving private conversations
    const user = await ctx.runQuery(api.users.getById, { id: args.userId });
    if (!user || user.isAnonymous) {
      throw new Error("Anonymous users cannot save private conversations.");
    }
    // Generate a title from the first user message or use provided title
    const firstUserMessage = args.messages.find(msg => msg.role === "user");
    const conversationTitle =
      args.title ||
      (firstUserMessage
        ? firstUserMessage.content.slice(0, 100) +
          (firstUserMessage.content.length > 100 ? "..." : "")
        : "Saved Private Chat");

    // Create the conversation
    const conversationId = await ctx.runMutation(api.conversations.create, {
      title: conversationTitle,
      userId: args.userId,
      personaId: args.personaId,
    });

    // Process and save all messages to the conversation
    for (const message of args.messages) {
      // Skip empty assistant messages (placeholders)
      if (message.role === "assistant" && !message.content) {
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
    await ctx.runMutation(api.conversations.update, {
      id: conversationId,
      isStreaming: false,
    });

    // Schedule title generation if not provided
    if (!args.title) {
      await ctx.scheduler.runAfter(100, api.titleGeneration.generateTitle, {
        conversationId,
        message: firstUserMessage?.content || "Saved Private Chat",
      });
    }

    return conversationId;
  },
});

// Continue to send messages in a conversation
export const continueConversation = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    model: v.string(),
    provider: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    userMessageId: Id<"messages">;
    assistantMessageId: Id<"messages">;
  }> => {
    // This is essentially the same as sendFollowUpMessage
    // Redirecting to avoid code duplication
    return await ctx.runAction(api.conversations.sendFollowUpMessage, {
      conversationId: args.conversationId,
      content: args.content,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      model: args.model,
      provider: args.provider,
    });
  },
});

export const getStreamingState = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);
    if (!conversation) {
      return null;
    }

    return {
      isStreaming: conversation.isStreaming,
      conversationId: conversation._id,
    };
  },
});

// Get all conversations for a user (for bulk export) - Optimized
export const getAllForUser = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includePinned: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await requireAuth(ctx));
    const limit = args.limit || 1000; // Default limit to prevent excessive queries

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .order("desc");

    // Apply limit
    const conversations = await query.take(limit);

    // Filter efficiently - only if we need to exclude certain types
    if (args.includeArchived === false || args.includePinned === false) {
      const filtered = conversations.filter(conv => {
        if (args.includeArchived === false && conv.isArchived) {
          return false;
        }
        if (args.includePinned === false && conv.isPinned) {
          return false;
        }
        return true;
      });

      return filtered.map(conv => ({
        _id: conv._id,
        _creationTime: conv._creationTime,
        title: conv.title,
        isArchived: conv.isArchived,
        isPinned: conv.isPinned,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: 0, // Will be populated if needed
      }));
    }

    // If including all types, return directly without filtering
    return conversations.map(conv => ({
      _id: conv._id,
      _creationTime: conv._creationTime,
      title: conv.title,
      isArchived: conv.isArchived,
      isPinned: conv.isPinned,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: 0, // Will be populated if needed
    }));
  },
});

// Get conversation metadata - Optimized for export UI
export const getConversationsSummaryForExport = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includePinned: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await requireAuth(ctx));
    const limit = args.limit || 500; // Reasonable limit for UI display

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .order("desc");

    const conversations = await query.take(limit);

    // Filter efficiently - only if we need to exclude certain types
    const filteredConversations = conversations.filter(conv => {
      if (args.includeArchived === false && conv.isArchived) {
        return false;
      }
      if (args.includePinned === false && conv.isPinned) {
        return false;
      }
      return true;
    });

    // Map conversations to summary format without expensive message count calculation
    const conversationSummaries = filteredConversations.map(conv => ({
      _id: conv._id,
      _creationTime: conv._creationTime,
      title: conv.title,
      isArchived: conv.isArchived,
      isPinned: conv.isPinned,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));

    return {
      conversations: conversationSummaries,
      totalCount: conversationSummaries.length,
    };
  },
});

// Get conversation with all messages for export - Optimized single conversation
export const getWithMessagesForExport = query({
  args: {
    conversationId: v.id("conversations"),
    includeAttachmentContent: v.optional(v.boolean()),
    maxMessages: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await requireAuth(ctx));
    const maxMessages = args.maxMessages || 10000; // Reasonable limit

    // Get conversation and verify ownership
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new ConvexError("Conversation not found or access denied");
    }

    // Get messages with limit to prevent timeouts
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_main_branch", q =>
        q.eq("conversationId", args.conversationId).eq("isMainBranch", true)
      )
      .order("asc")
      .take(maxMessages);

    return {
      conversation: {
        _id: conversation._id,
        _creationTime: conversation._creationTime,
        title: conversation.title,
        isArchived: conversation.isArchived,
        isPinned: conversation.isPinned,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        personaId: conversation.personaId,
      },
      messages: messages.map(msg => ({
        _id: msg._id,
        _creationTime: msg._creationTime,
        role: msg.role,
        content: msg.content,
        reasoning: msg.reasoning,
        model: msg.model,
        provider: msg.provider,
        attachments: msg.attachments?.map(att => ({
          type: att.type,
          name: att.name,
          size: att.size,
          // Include attachment content only if explicitly requested
          ...(args.includeAttachmentContent && {
            url: att.url,
            content: att.content,
            thumbnail: att.thumbnail,
          }),
        })),
        citations: msg.citations,
        metadata: msg.metadata,
        createdAt: msg.createdAt,
      })),
    };
  },
});

// Bulk export multiple conversations with messages - Optimized for performance
export const getBulkWithMessagesForExport = query({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    maxMessagesPerConversation: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await requireAuth(ctx));
    const maxMessagesPerConv = args.maxMessagesPerConversation || 5000; // Reasonable limit per conversation
    const maxConversations = 50; // Limit number of conversations to prevent timeouts

    // Limit the number of conversations to prevent timeouts
    const limitedConversationIds = args.conversationIds.slice(
      0,
      maxConversations
    );

    // Get all conversations in parallel and verify ownership
    const conversationsPromises = limitedConversationIds.map(
      async conversationId => {
        const conversation = await ctx.db.get(conversationId);
        if (!conversation || conversation.userId !== userId) {
          return null; // Skip conversations we don't have access to
        }
        return conversation;
      }
    );

    const conversations = (await Promise.all(conversationsPromises)).filter(
      (conv): conv is NonNullable<typeof conv> => conv !== null
    );

    // Get messages for all conversations in parallel
    const conversationDataPromises = conversations.map(async conversation => {
      // Get messages with limit to prevent timeouts
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_main_branch", q =>
          q.eq("conversationId", conversation._id).eq("isMainBranch", true)
        )
        .order("asc")
        .take(maxMessagesPerConv);

      return {
        conversation: {
          _id: conversation._id,
          _creationTime: conversation._creationTime,
          title: conversation.title,
          isArchived: conversation.isArchived,
          isPinned: conversation.isPinned,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          personaId: conversation.personaId,
        },
        messages: messages.map(msg => ({
          _id: msg._id,
          _creationTime: msg._creationTime,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          model: msg.model,
          provider: msg.provider,
          attachments: msg.attachments?.map(att => ({
            type: att.type,
            name: att.name,
            size: att.size,
            // Include attachment content only if explicitly requested
            ...(args.includeAttachmentContent && {
              url: att.url,
              content: att.content,
              thumbnail: att.thumbnail,
            }),
          })),
          citations: msg.citations,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        })),
      };
    });

    const conversationData = await Promise.all(conversationDataPromises);

    return {
      conversations: conversationData,
      totalRequested: args.conversationIds.length,
      totalReturned: conversationData.length,
      maxMessagesPerConversation: maxMessagesPerConv,
    };
  },
});

// Bulk import conversations - Optimized with better validation and error handling
export const bulkImport = mutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: v.union(
              v.literal("user"),
              v.literal("assistant"),
              v.literal("system")
            ),
            content: v.string(),
            createdAt: v.optional(v.number()),
            model: v.optional(v.string()),
            provider: v.optional(v.string()),
            reasoning: v.optional(v.string()),
            // Support basic attachment metadata import
            attachments: v.optional(
              v.array(
                v.object({
                  type: v.union(
                    v.literal("image"),
                    v.literal("pdf"),
                    v.literal("text")
                  ),
                  name: v.string(),
                  size: v.number(),
                })
              )
            ),
          })
        ),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
        isArchived: v.optional(v.boolean()),
        isPinned: v.optional(v.boolean()),
      })
    ),
    skipDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const importedConversations = [];
    const skippedConversations = [];
    const errors = [];

    // If skipDuplicates is true, get existing conversation titles to avoid duplicates
    let existingTitles = new Set<string>();
    if (args.skipDuplicates) {
      const existingConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", userId))
        .take(1000); // Limit for duplicate check
      existingTitles = new Set(existingConversations.map(c => c.title));
    }

    // Process conversations in batches to avoid timeouts
    const batchSize = 10;
    for (let i = 0; i < args.conversations.length; i += batchSize) {
      const batch = args.conversations.slice(i, i + batchSize);

      for (const convData of batch) {
        try {
          // Skip if duplicate and skipDuplicates is enabled
          if (args.skipDuplicates && existingTitles.has(convData.title)) {
            skippedConversations.push(convData.title);
            continue;
          }

          // Validate message content
          if (!convData.messages || convData.messages.length === 0) {
            errors.push(`Conversation "${convData.title}" has no messages`);
            continue;
          }

          // Create conversation
          const conversationId = await ctx.db.insert("conversations", {
            title: convData.title || "Imported Conversation",
            userId,
            createdAt: convData.createdAt || now,
            updatedAt: convData.updatedAt || now,
            isArchived: convData.isArchived,
            isPinned: convData.isPinned,
          });

          // Create messages with proper ordering
          for (
            let msgIndex = 0;
            msgIndex < convData.messages.length;
            msgIndex++
          ) {
            const msgData = convData.messages[msgIndex];

            // Skip empty messages
            if (!msgData.content || msgData.content.trim() === "") {
              continue;
            }

            await ctx.db.insert("messages", {
              conversationId,
              role: msgData.role,
              content: msgData.content,
              isMainBranch: true,
              createdAt: msgData.createdAt || now + msgIndex, // Ensure ordering
              model: msgData.model,
              provider: msgData.provider,
              reasoning: msgData.reasoning,
              // Include basic attachment metadata if provided
              attachments: msgData.attachments?.map(att => ({
                type: att.type,
                name: att.name,
                size: att.size,
                url: "", // Will be empty since we're not importing actual files
              })),
            });
          }

          importedConversations.push(conversationId);

          // Add to existing titles set to avoid duplicates within this import
          existingTitles.add(convData.title);
        } catch (error) {
          errors.push(
            `Failed to import conversation "${convData.title}": ${error}`
          );
        }
      }
    }

    return {
      importedCount: importedConversations.length,
      conversationIds: importedConversations,
      skippedCount: skippedConversations.length,
      skippedTitles: skippedConversations,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Limit error messages to prevent response size issues
    };
  },
});

// Helper function to generate export title and description
const generateExportMetadata = (
  conversationIds: Array<Id<"conversations">>,
  includeAttachments: boolean
) => {
  const dateStr = new Date().toLocaleDateString();
  const count = conversationIds.length;

  const title =
    count === 1
      ? `Conversation Export - ${dateStr}`
      : `${count} Conversations Export - ${dateStr}`;

  const description = includeAttachments
    ? `Export of ${count} conversation${
        count !== 1 ? "s" : ""
      } with attachments created on ${dateStr}`
    : `Export of ${count} conversation${
        count !== 1 ? "s" : ""
      } created on ${dateStr}`;

  return { title, description };
};

// Background export processing with job tracking
export const scheduleBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Generate export metadata
    const metadata = generateExportMetadata(
      args.conversationIds,
      args.includeAttachmentContent ?? false
    );

    // Create export job record with enhanced metadata
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.jobId,
      userId,
      type: "export",
      totalItems: args.conversationIds.length,
      title: metadata.title,
      description: metadata.description,
      conversationIds: args.conversationIds,
      includeAttachments: args.includeAttachmentContent,
    });

    // Schedule background processing
    await ctx.scheduler.runAfter(
      100,
      api.conversations.processBackgroundExport,
      {
        conversationIds: args.conversationIds,
        includeAttachmentContent: args.includeAttachmentContent,
        jobId: args.jobId,
        userId,
      }
    );

    return { jobId: args.jobId, status: "scheduled" };
  },
});

export const processBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
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

      const conversations = await ctx.runQuery(
        internal.backgroundJobs.getExportData,
        {
          conversationIds: args.conversationIds,
          userId: args.userId,
        }
      );

      const processInChunks = async <T>(
        items: T[],
        chunkSize: number,
        processor: (chunk: T[]) => Promise<void>
      ) => {
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          await processor(chunk);
        }
      };

      let processedCount = 0;
      await processInChunks(
        conversations,
        CHUNK_SIZE,
        async (chunk: ExportConversation[]) => {
          processedCount += chunk.length;
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.jobId,
            processedItems: processedCount,
            totalItems: conversations.length,
          });
        }
      );

      const allConversations = await ctx.runQuery(
        internal.backgroundJobs.getExportData,
        {
          conversationIds: args.conversationIds,
          userId: args.userId,
          includeAttachments: args.includeAttachmentContent,
        }
      );

      const fullExportData = createConvexExportData(
        allConversations,
        args.includeAttachmentContent ?? false
      );

      const exportBlob = new Blob([JSON.stringify(fullExportData, null, 2)], {
        type: "application/json",
      });

      const storageId = await ctx.storage.store(exportBlob);

      // Save the export result with manifest
      await ctx.runMutation(api.backgroundJobs.saveExportResult, {
        jobId: args.jobId,
        manifest: fullExportData.manifest,
        fileStorageId: storageId,
        status: "completed",
      });

      return { success: true, jobId: args.jobId };
    } catch (error) {
      // Update status to failed
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

// Background import processing with job tracking
export const scheduleBackgroundImport = action({
  args: {
    conversations: v.array(v.any()),
    importId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Create import job record
    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.importId,
      userId,
      type: "import",
      totalItems: args.conversations.length,
      title: args.title,
      description: args.description,
    });

    // Schedule background processing
    await ctx.scheduler.runAfter(
      100,
      api.conversations.processBackgroundImport,
      {
        conversations: args.conversations,
        importId: args.importId,
        userId,
      }
    );

    return { importId: args.importId, status: "scheduled" };
  },
});

export const processBackgroundImport = action({
  args: {
    conversations: v.array(v.any()),
    importId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.importId,
        status: "processing",
      });

      const results = {
        totalImported: 0,
        errors: [] as string[],
        allImportedIds: [] as string[],
      };

      // Process conversations in batches
      for (let i = 0; i < args.conversations.length; i += BATCH_SIZE) {
        const batch = args.conversations.slice(i, i + BATCH_SIZE);

        try {
          const batchResults = await ctx.runMutation(
            internal.conversationImport.processBatch,
            {
              conversations: batch,
              userId: args.userId,
              baseTime: Date.now(),
            }
          );

          results.totalImported += batchResults.conversationIds.length;
          results.allImportedIds.push(...batchResults.conversationIds);
          // processBatch doesn't return errors, so we'll assume success

          // Update progress
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.importId,
            processedItems: i + batch.length,
            totalItems: args.conversations.length,
          });
        } catch (error) {
          results.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error}`
          );
        }
      }

      // Save import result with conversation IDs
      await ctx.runMutation(api.backgroundJobs.saveImportResult, {
        jobId: args.importId,
        result: {
          totalImported: results.totalImported,
          totalProcessed: args.conversations.length,
          errors: results.errors,
          conversationIds: results.allImportedIds,
        },
        status: "completed",
      });

      return results;
    } catch (error) {
      // Update status to failed
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.importId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

// Background bulk delete processing with job tracking
export const scheduleBackgroundBulkDelete = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Validate that user owns all conversations
    const conversations = await Promise.all(
      args.conversationIds.map(id =>
        ctx.runQuery(api.conversations.get, { id })
      )
    );

    const validConversations = conversations.filter(
      conv => conv && conv.userId === userId
    );
    if (validConversations.length !== args.conversationIds.length) {
      throw new ConvexError("Some conversations not found or access denied");
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
      userId,
      type: "bulk_delete",
      totalItems: args.conversationIds.length,
      title,
      description,
      conversationIds: args.conversationIds,
    });

    // Schedule background processing
    await ctx.scheduler.runAfter(
      100,
      api.conversations.processBackgroundBulkDelete,
      {
        conversationIds: args.conversationIds,
        jobId: args.jobId,
        userId,
      }
    );

    return { jobId: args.jobId, status: "scheduled" };
  },
});

export const processBackgroundBulkDelete = action({
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

      const results = {
        totalDeleted: 0,
        errors: [] as string[],
        deletedIds: [] as string[],
      };

      // Process conversations in small batches to avoid timeouts
      const BATCH_SIZE = 3; // Small batch size for deletion operations
      for (let i = 0; i < args.conversationIds.length; i += BATCH_SIZE) {
        const batch = args.conversationIds.slice(i, i + BATCH_SIZE);

        try {
          // Process each conversation in the batch
          for (const conversationId of batch) {
            try {
              const conversation = await ctx.runQuery(api.conversations.get, {
                id: conversationId,
              });

              if (!conversation || conversation.userId !== args.userId) {
                results.errors.push(
                  `Conversation ${conversationId} not found or access denied`
                );
                continue;
              }

              // Delete the conversation using the single conversation remove function
              await ctx.runMutation(api.conversations.remove, {
                id: conversationId,
              });

              results.totalDeleted += 1;
              results.deletedIds.push(conversationId);
            } catch (error) {
              results.errors.push(
                `Failed to delete conversation ${conversationId}: ${error}`
              );
            }
          }

          // Update progress
          await ctx.runMutation(api.backgroundJobs.updateProgress, {
            jobId: args.jobId,
            processedItems: Math.min(
              i + BATCH_SIZE,
              args.conversationIds.length
            ),
            totalItems: args.conversationIds.length,
          });
        } catch (error) {
          results.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error}`
          );
        }
      }

      // Save bulk delete result
      await ctx.runMutation(api.backgroundJobs.saveImportResult, {
        jobId: args.jobId,
        result: {
          totalImported: results.totalDeleted, // Reusing field name for consistency
          totalProcessed: args.conversationIds.length,
          errors: results.errors,
          conversationIds: results.deletedIds,
        },
        status: "completed",
      });

      return { success: true, totalDeleted: results.totalDeleted };
    } catch (error) {
      // Update status to failed
      await ctx.runMutation(api.backgroundJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
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

        // Use atomic decrement operations to avoid race conditions
        // Only count user messages for totalMessageCount
        const userMessageCount = messages.filter(m => m.role === "user").length;

        // Use atomic decrement for conversation count
        const user = await ctx.db.get(conversation.userId);
        if (user) {
          await ctx.db.patch(user._id, {
            conversationCount: (user.conversationCount || 0) - 1,
          });
        }

        // Use atomic decrement for total message count if there are user messages
        if (user && userMessageCount > 0) {
          await ctx.db.patch(user._id, {
            totalMessageCount: (user.totalMessageCount || 0) - userMessageCount,
          });
        }
        results.push({ id, status: "deleted" });
      }
      return results;
    }

    // For large numbers of conversations, delegate to background job
    throw new ConvexError(
      "Too many conversations to delete at once. Please use the background deletion feature."
    );
  },
});

// Internal mutation that batches user message creation with count increment
export const createUserMessageBatched = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentSchema)),
    useWebSearch: v.optional(v.boolean()),
    userId: v.id("users"),
    isPollyProvided: v.optional(v.boolean()),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (ctx, args) => {
    // Create user message
    const userMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      reasoningConfig: args.reasoningConfig,
      isMainBranch: true,
      createdAt: Date.now(),
    });

    // Increment user's message count for limit tracking (only for Polly-provided models)
    const conversation = await ctx.db.get(args.conversationId);
    const user = await ctx.db.get(conversation?.userId as Id<"users">);
    if (conversation && user) {
      if (args.isPollyProvided && !user.hasUnlimitedCalls) {
        const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
        const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;

        if (monthlyMessagesSent >= monthlyLimit) {
          throw new ConvexError("Monthly Polly model message limit reached.");
        }

        await ctx.db.patch(conversation.userId, {
          messagesSent: (user.messagesSent || 0) + 1,
          monthlyMessagesSent: (user.monthlyMessagesSent || 0) + 1,
          totalMessageCount: (user.totalMessageCount || 0) + 1,
        });
      }

      await ctx.db.patch(conversation.userId, {
        totalMessageCount: (user.totalMessageCount || 0) + 1,
      });
    }

    return userMessageId;
  },
});
