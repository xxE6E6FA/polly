import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { type ActionCtx } from "./_generated/server";
import { getOptionalUserId, requireAuth } from "./lib/auth";
import {
  attachmentSchema,
  reasoningConfigSchema,
  messageRoleSchema,
  webCitationSchema,
} from "./lib/schemas";
import {
  paginationOptsSchema,
  createEmptyPaginationResult,
  validatePaginationOpts,
} from "./lib/pagination";
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MESSAGE_BATCH_SIZE,
  WEB_SEARCH_MAX_RESULTS,
  getDefaultSystemPrompt,
} from "./constants";
import {
  type StreamingActionResult,
  type MessageActionArgs,
  type ConversationDoc,
  type MessageDoc,
  findStreamingMessage,
  ensureStreamingCleared,
  deleteMessagesAfterIndex,
  resolveAttachmentUrls,
  buildUserMessageContent,
  getDefaultSystemPromptForConversation,
} from "./lib/conversation_utils";

// Common helper to create a user message with attachments
const createUserMessage = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
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
    useWebSearch?: boolean;
    userId: Id<"users">;
    provider: string;
    isPollyProvided?: boolean;
  }
): Promise<Id<"messages">> => {
  // Process attachments if provided
  let processedAttachments = args.attachments;
  if (args.attachments && args.attachments.length > 0) {
    processedAttachments = await processAttachmentsForStorage(
      ctx,
      args.attachments
    );
  }

  // Create user message
  const userMessageId = await ctx.runMutation(api.messages.create, {
    conversationId: args.conversationId,
    role: "user",
    content: args.content,
    attachments: processedAttachments,
    useWebSearch: args.useWebSearch,
    isMainBranch: true,
  });

  // Increment user's message count for limit tracking (only for Polly-provided models)
  await ctx.runMutation(api.users.incrementMessageCountAtomic, {
    userId: args.userId,
    isPollyProvided: args.isPollyProvided,
  });

  return userMessageId;
};

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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { mimeType, ...cleanAttachment } = attachment;
          return cleanAttachment;
        }
      }

      // Return as-is if no upload needed (but remove mimeType for schema compatibility)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Get the selected model to check if it's Polly-provided
  const selectedModel = await ctx.runQuery(api.userModels.getUserSelectedModel);
  const isPollyProvided = selectedModel?.free === true;

  // Enforce message limit for users (only for Polly-provided models)
  await ctx.runMutation(api.users.enforceMessageLimit, {
    userId: conversation.userId,
    modelProvider: args.provider,
    isPollyProvided,
  });

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
    msg => msg !== undefined
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

    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      createdAt: now,
      updatedAt: now,
    });

    // Use atomic increment instead of read-modify-write
    await ctx.runMutation(internal.users.incrementConversationCountAtomic, {
      userId: args.userId,
    });

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
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      createdAt: now,
      updatedAt: now,
    });

    // Use atomic increment for conversation count
    await ctx.runMutation(internal.users.incrementConversationCountAtomic, {
      userId: args.userId,
    });

    // Count user messages we'll create for total message count tracking
    let userMessageCount = 0;

    // Create system message if persona prompt exists (don't count system messages)
    if (args.personaPrompt) {
      await ctx.db.insert("messages", {
        conversationId,
        role: "system",
        content: args.personaPrompt,
        isMainBranch: true,
        createdAt: now,
      });
    }

    // Create user message (count this one)
    const userMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.firstMessage,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      isMainBranch: true,
      createdAt: now,
    });
    userMessageCount++;

    // Get whether this is a Polly-provided model based on the provider
    const isPollyProvided =
      args.provider === "google" &&
      args.model?.includes("gemini-2.5-flash-lite");

    // Use atomic increment for message count (only for Polly-provided models)
    await ctx.runMutation(api.users.incrementMessageCountAtomic, {
      userId: args.userId,
      isPollyProvided,
    });

    // Create empty assistant message for streaming (don't count assistant messages)
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      model: args.model,
      provider: args.provider,
      isMainBranch: true,
      createdAt: now,
    });

    // Use atomic increment for total message count (only count user messages)
    await ctx.runMutation(internal.users.incrementTotalMessageCountAtomic, {
      userId: args.userId,
      increment: userMessageCount,
    });

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
    const userId = args.userId || (await getOptionalUserId(ctx));

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .filter(q => q.neq(q.field("isArchived"), true))
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    return validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.collect();
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
    const userId = args.userId || (await getOptionalUserId(ctx));

    if (!userId) {
      return args.paginationOpts ? createEmptyPaginationResult() : [];
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .filter(q => q.neq(q.field("isArchived"), true))
      .order("desc");

    const validatedOpts = validatePaginationOpts(args.paginationOpts);
    const results = validatedOpts
      ? await query.paginate(validatedOpts)
      : await query.collect();

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
      const userId = args.userId || (await getOptionalUserId(ctx));

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // Use atomic decrement operations to avoid race conditions
    // Only count user messages for totalMessageCount
    const userMessageCount = messages.filter(m => m.role === "user").length;

    // Use atomic decrement for conversation count
    await ctx.runMutation(internal.users.decrementConversationCountAtomic, {
      userId: conversation.userId,
    });

    // Use atomic decrement for total message count if there are user messages
    if (userMessageCount > 0) {
      await ctx.runMutation(internal.users.decrementTotalMessageCountAtomic, {
        userId: conversation.userId,
        decrement: userMessageCount,
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
    const userId = args.userId || (await getOptionalUserId(ctx));

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
      : await query.collect();
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
    const userId = args.userId || (await getOptionalUserId(ctx));

    if (!userId) {
      return createEmptyPaginationResult();
    }

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .filter(q => q.neq(q.field("isArchived"), true))
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
    const resolvedUserId = args.userId || (await getOptionalUserId(ctx));

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
    // Create user if needed
    const actualUserId: Id<"users"> = !args.userId
      ? await ctx.runMutation(api.users.createAnonymous)
      : args.userId;

    // Get user's selected model
    const selectedModel = await ctx.runQuery(
      api.userModels.getUserSelectedModel
    );
    if (!selectedModel) {
      throw new Error("No model selected. Please select a model in Settings.");
    }

    // Check if it's a Polly-provided model
    const isPollyProvided = selectedModel.free === true;

    // Enforce message limit for users (only for Polly-provided models)
    await ctx.runMutation(api.users.enforceMessageLimit, {
      userId: actualUserId,
      isPollyProvided,
    });

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
    });

    // Create context message if contextSummary is provided
    if (args.sourceConversationId && args.contextSummary) {
      await ctx.runMutation(api.messages.create, {
        conversationId: result.conversationId,
        role: "context",
        content: `Context from previous conversation: ${args.contextSummary}`,
        sourceConversationId: args.sourceConversationId,
        isMainBranch: true,
      });
    }

    // Build context messages for AI response
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

    // Get the selected model to check if it's Polly-provided
    const selectedModel = await ctx.runQuery(
      api.userModels.getUserSelectedModel
    );
    const isPollyProvided = selectedModel?.free === true;

    // Create user message
    const userMessageId = await createUserMessage(ctx, {
      conversationId: args.conversationId,
      content: args.content,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      userId: conversation.userId,
      provider: args.provider,
      isPollyProvided,
    });

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
      useWebSearch: lastMessage.useWebSearch || false,
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
        attachments: v.optional(v.array(attachmentSchema)),
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
    // Get user's selected model to check if it's Polly-provided
    const selectedModel = await ctx.runQuery(
      api.userModels.getUserSelectedModel
    );
    const isPollyProvided = selectedModel?.free === true;

    // Enforce message limit for users (only for Polly-provided models)
    await ctx.runMutation(api.users.enforceMessageLimit, {
      userId: args.userId,
      isPollyProvided,
    });

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
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = args.limit || 1000; // Default limit to prevent excessive queries

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc");

    // Apply limit
    const conversations = await query.take(limit);

    // Filter efficiently - only if we need to exclude certain types
    if (args.includeArchived === false || args.includePinned === false) {
      const filtered = conversations.filter(conv => {
        if (args.includeArchived === false && conv.isArchived) return false;
        if (args.includePinned === false && conv.isPinned) return false;
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

// Get conversation metadata with message counts - Optimized for export UI
export const getConversationsSummaryForExport = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includePinned: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = args.limit || 500; // Reasonable limit for UI display

    const query = ctx.db
      .query("conversations")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc");

    const conversations = await query.take(limit);

    // Filter efficiently - only if we need to exclude certain types
    const filteredConversations = conversations.filter(conv => {
      if (args.includeArchived === false && conv.isArchived) return false;
      if (args.includePinned === false && conv.isPinned) return false;
      return true;
    });

    // Get message counts for all conversations in parallel
    const conversationSummaries = await Promise.all(
      filteredConversations.map(async conv => {
        const messageCount = await ctx.db
          .query("messages")
          .withIndex("by_conversation_main_branch", q =>
            q.eq("conversationId", conv._id).eq("isMainBranch", true)
          )
          .collect()
          .then(messages => messages.length);

        return {
          _id: conv._id,
          _creationTime: conv._creationTime,
          title: conv.title,
          isArchived: conv.isArchived,
          isPinned: conv.isPinned,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount,
        };
      })
    );

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
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
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
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
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
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
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
            isArchived: convData.isArchived || false,
            isPinned: convData.isPinned || false,
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

// Background export processing with job tracking
export const scheduleBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    exportId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Create export job record
    await ctx.runMutation(api.exportJobs.create, {
      exportId: args.exportId,
      userId,
      type: "export",
      status: "scheduled",
      conversationIds: args.conversationIds,
      totalConversations: args.conversationIds.length,
    });

    // Schedule background processing
    await ctx.scheduler.runAfter(
      100,
      api.conversations.processBackgroundExport,
      {
        conversationIds: args.conversationIds,
        includeAttachmentContent: args.includeAttachmentContent,
        exportId: args.exportId,
        userId,
      }
    );

    return { exportId: args.exportId, status: "scheduled" };
  },
});

export const processBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    exportId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.exportJobs.updateStatus, {
        exportId: args.exportId,
        status: "processing",
      });

      // Process in chunks to avoid timeouts
      const chunkSize = 25; // Conservative chunk size
      const allConversations = [];
      let processedCount = 0;

      for (let i = 0; i < args.conversationIds.length; i += chunkSize) {
        const chunk = args.conversationIds.slice(i, i + chunkSize);

        // Process chunk
        const chunkResult = await ctx.runQuery(
          api.conversations.getBulkWithMessagesForExport,
          {
            conversationIds: chunk,
            includeAttachmentContent: args.includeAttachmentContent,
            maxMessagesPerConversation: 5000,
          }
        );

        allConversations.push(...chunkResult.conversations);
        processedCount += chunk.length;

        // Update progress
        await ctx.runMutation(api.exportJobs.updateProgress, {
          exportId: args.exportId,
          processed: processedCount,
          total: args.conversationIds.length,
        });

        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Prepare final export data
      const exportData = {
        version: "1.0.0",
        source: "Polly",
        exportedAt: new Date().toISOString(),
        totalConversations: allConversations.length,
        conversations: allConversations,
      };

      // Save the result
      await ctx.runMutation(api.exportJobs.saveResult, {
        exportId: args.exportId,
        result: exportData,
        status: "completed",
      });

      return { success: true, exportId: args.exportId };
    } catch (error) {
      console.error("Background export failed:", error);

      await ctx.runMutation(api.exportJobs.updateStatus, {
        exportId: args.exportId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
});

// Background import processing
export const scheduleBackgroundImport = action({
  args: {
    conversations: v.array(v.any()), // Use any for flexible import format
    importId: v.string(),
    skipDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Create import job record
    await ctx.runMutation(api.exportJobs.create, {
      exportId: args.importId,
      userId,
      type: "import",
      status: "scheduled",
      conversationIds: [], // Empty for imports
      totalConversations: args.conversations.length,
    });

    // Schedule background processing
    await ctx.scheduler.runAfter(
      100,
      api.conversations.processBackgroundImport,
      {
        conversations: args.conversations,
        importId: args.importId,
        skipDuplicates: args.skipDuplicates,
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
    skipDuplicates: v.optional(v.boolean()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.exportJobs.updateStatus, {
        exportId: args.importId,
        status: "processing",
      });

      // Process in smaller batches for imports
      const batchSize = 5; // Smaller batches for imports (more database writes)
      let totalImported = 0;
      const errors = [];

      for (let i = 0; i < args.conversations.length; i += batchSize) {
        const batch = args.conversations.slice(i, i + batchSize);

        // Process batch
        const batchResult = await ctx.runMutation(
          api.conversations.bulkImport,
          {
            conversations: batch,
            skipDuplicates: args.skipDuplicates,
          }
        );

        totalImported += batchResult.importedCount;
        errors.push(...batchResult.errors);

        // Update progress
        await ctx.runMutation(api.exportJobs.updateProgress, {
          exportId: args.importId,
          processed: i + batch.length,
          total: args.conversations.length,
        });

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Save final result
      await ctx.runMutation(api.exportJobs.saveResult, {
        exportId: args.importId,
        result: {
          totalImported,
          totalProcessed: args.conversations.length,
          errors: errors.slice(0, 20), // Limit error messages
        },
        status: "completed",
      });

      return { success: true, importId: args.importId, totalImported };
    } catch (error) {
      console.error("Background import failed:", error);

      await ctx.runMutation(api.exportJobs.updateStatus, {
        exportId: args.importId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
});
