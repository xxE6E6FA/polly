import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  DEFAULT_BUILTIN_MODEL_ID,
  MESSAGE_BATCH_SIZE,
} from "../shared/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { withRetry } from "./ai/error_handlers";
import {
  processBulkDelete,
  scheduleBackgroundBulkDelete,
  scheduleBackgroundImport,
} from "./lib/conversation/background_operations";
import { handleMessageDeletion } from "./lib/conversation/message_handling";
import {
  buildContextMessages,
  checkConversationAccess,
  executeStreamingActionForRetry,
  incrementUserMessageStats,
  processAttachmentsForStorage,
} from "./lib/conversation_utils";
import { log } from "./lib/logger";
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
import {
  createDefaultConversationFields,
  createDefaultMessageFields,
  getAuthenticatedUserWithDataForAction,
  hasConversationAccess,
  setConversationStreaming,
  setConversationStreamingForAction,
  stopConversationStreaming,
  validateAuthenticatedUser,
  validateConversationAccess,
  validateMonthlyMessageLimit,
  validateMonthlyMessageLimitForAction,
  validateUserMessageLength,
} from "./lib/shared_utils";
import { isConversationStreaming } from "./lib/streaming_utils";
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
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const [user, fullModel] = await Promise.all([
      validateAuthenticatedUser(ctx),
      getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider),
    ]);

    // Check if this is a built-in free model and enforce limits
    // If model has 'free' field, it's from builtInModels table and is a built-in model
    const isBuiltInModelResult = fullModel.free === true;

    if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
      await validateMonthlyMessageLimit(ctx, user);
    }

    // Always start with a neutral placeholder so title generation logic can update it
    const initialTitle = args.title ?? "New conversation";

    // Create conversation
    const conversationId = await ctx.db.insert(
      "conversations",
      createDefaultConversationFields(user._id, {
        title: initialTitle,
        personaId: args.personaId,
        sourceConversationId: args.sourceConversationId,
      })
    );

    // Backfill rootConversationId on creation for new conversations
    try {
      await ctx.db.patch(conversationId, {
        rootConversationId: conversationId,
      });
    } catch {
      // Ignore errors if already set
    }

    // Update user conversation count with retry to avoid conflicts
    await withRetry(
      async () => {
        const freshUser = await ctx.db.get(user._id);
        if (!freshUser) {
          throw new Error("User not found");
        }
        await ctx.db.patch(user._id, {
          conversationCount: Math.max(
            0,
            (freshUser.conversationCount || 0) + 1
          ),
        });
      },
      5,
      25
    );

    // Create user message
    // Enforce max user message size
    validateUserMessageLength(args.firstMessage);
    const userMessageId = await ctx.db.insert(
      "messages",
      createDefaultMessageFields(conversationId, {
        role: "user",
        content: args.firstMessage,
        attachments: args.attachments,
        reasoningConfig: args.reasoningConfig,
        temperature: args.temperature,
      })
    );

    // Increment rolling token estimate for the first user message
    try {
      const delta = Math.max(
        1,
        Math.ceil((args.firstMessage || "").length / 4)
      );
      await withRetry(
        async () => {
          const fresh = await ctx.db.get(conversationId);
          if (!fresh) {
            return;
          }
          await ctx.db.patch(conversationId, {
            tokenEstimate: Math.max(0, (fresh.tokenEstimate || 0) + delta),
          });
        },
        5,
        25
      );
    } catch {
      // best-effort; ignore failures
    }

    // Create assistant message directly (avoid extra mutation call)
    // Set initial status to "thinking" to ensure UI treats it as live before HTTP stream flips to "streaming"
    const assistantMessageId = await ctx.db.insert(
      "messages",
      createDefaultMessageFields(conversationId, {
        role: "assistant",
        content: "",
        model: fullModel.modelId,
        provider: fullModel.provider,
        status: "thinking",
      })
    );

    // Increment stats if needed (serialize to avoid user doc conflicts)
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      const effectiveModelId = args.model || fullModel.modelId;
      const effectiveProvider = args.provider || fullModel.provider;
      await incrementUserMessageStats(
        ctx,
        user._id,
        effectiveModelId,
        effectiveProvider,
        undefined,
        {
          countTowardsMonthly: Boolean((fullModel as { free?: boolean })?.free),
        }
      );
    }

    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      // Always mark streaming
      await setConversationStreaming(ctx, conversationId, true);
      // Avoid scheduling in tests because convex-test disallows system writes post-transaction
      if (process.env.NODE_ENV !== "test") {
        await ctx.scheduler.runAfter(
          0,
          api.titleGeneration.generateTitleBackground,
          {
            conversationId,
            message: args.firstMessage,
          }
        );
      }
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
 * Create a user message without triggering AI response (for image generation)
 *
 * Note: If this is the first user message in a conversation with a generic title
 * (like "Image Generation"), it will schedule title generation based on the user message.
 */
export const createUserMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
  },
  returns: v.object({
    userMessageId: v.id("messages"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    userMessageId: Id<"messages">;
  }> => {
    // Enforce max size on user-authored content
    validateUserMessageLength(args.content);
    // Get user's effective model with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Create user message only
    const userMessageId: Id<"messages"> = await ctx.runMutation(
      api.messages.create,
      {
        conversationId: args.conversationId,
        role: "user",
        content: args.content,
        attachments: args.attachments,
        reasoningConfig: args.reasoningConfig,
        model: fullModel.modelId,
        provider: fullModel.provider,
        metadata:
          args.temperature !== undefined
            ? { temperature: args.temperature }
            : undefined,
      }
    );

    // Check if this is the first user message in the conversation
    // If so, and the conversation has a generic title, schedule title generation
    // This handles image generation conversations which create empty conversations first
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });

    if (conversation) {
      const messages = await ctx.runQuery(api.messages.getAllInConversation, {
        conversationId: args.conversationId,
      });

      // Check if this is the first user message and the title looks generic
      const userMessages = messages.filter(
        (m: Doc<"messages">) => m.role === "user"
      );
      const hasGenericTitle =
        conversation.title === "Image Generation" ||
        conversation.title === "New Conversation" ||
        conversation.title === "New conversation";

      if (
        userMessages.length === 1 &&
        hasGenericTitle &&
        args.content.trim().length > 0
      ) {
        if (process.env.NODE_ENV !== "test") {
          // Schedule title generation based on the user message
          await ctx.scheduler.runAfter(
            100,
            api.titleGeneration.generateTitleBackground,
            {
              conversationId: args.conversationId,
              message: args.content,
            }
          );
        }
      }
    }

    return { userMessageId };
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
    attachments: v.optional(v.array(attachmentSchema)),
    reasoningConfig: v.optional(reasoningConfigSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    topK: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
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
    // Validate user message size before any writes
    validateUserMessageLength(args.content);
    const [conversation, fullModel] = await Promise.all([
      ctx.runQuery(api.conversations.get, { id: args.conversationId }),
      getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider),
    ]);

    // Use provided personaId, or fall back to conversation's existing personaId
    const effectivePersonaId =
      args.personaId !== undefined ? args.personaId : conversation?.personaId;

    // Store attachments as-is during message creation
    // PDF text extraction will happen during assistant response with progress indicators
    const processedAttachments = args.attachments;

    // Create user message first to maintain proper order
    const userMessageId = await ctx.runMutation(api.messages.create, {
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
    });

    // Then create assistant message and update streaming in parallel
    const [assistantMessageId] = await Promise.all([
      // Create assistant placeholder with thinking status
      ctx.runMutation(api.messages.create, {
        conversationId: args.conversationId,
        role: "assistant",
        content: "",
        status: "thinking",
        model: fullModel.modelId,
        provider: fullModel.provider,
      }),

      // Mark conversation as streaming and bump updatedAt so it jumps to top
      ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: true },
        setUpdatedAt: true,
      }),
    ]);

    // Load persona parameters if set and not explicitly overridden
    let personaParams: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      topK?: number;
      repetitionPenalty?: number;
    } = {};
    if (effectivePersonaId) {
      const persona = await ctx.runQuery(api.personas.get, {
        id: effectivePersonaId,
      });
      if (
        persona &&
        (persona as { advancedSamplingEnabled?: boolean })
          .advancedSamplingEnabled
      ) {
        // Only apply persona parameters if advanced sampling is enabled
        const rawParams = {
          // These fields are optional in the schema
          temperature: (persona as { temperature?: number }).temperature,
          topP: (persona as { topP?: number }).topP,
          topK: (persona as { topK?: number }).topK,
          frequencyPenalty: (persona as { frequencyPenalty?: number })
            .frequencyPenalty,
          presencePenalty: (persona as { presencePenalty?: number })
            .presencePenalty,
          repetitionPenalty: (persona as { repetitionPenalty?: number })
            .repetitionPenalty,
        };

        // Filter out undefined values
        personaParams = Object.fromEntries(
          Object.entries(rawParams).filter(([_, value]) => value !== undefined)
        ) as typeof personaParams;
      }
    }

    // Trigger summary generation in background based on context window limits
    // rather than message count. We estimate total tokens and compare against
    // the effective model context window with a conservative 100k cap to
    // protect multi-model conversations.
    try {
      // Prefer rolling estimate if present
      const latestConversation = await ctx.runQuery(api.conversations.get, {
        id: args.conversationId,
      });
      let totalTokens: number | null =
        latestConversation?.tokenEstimate ?? null;
      if (totalTokens === null || totalTokens === undefined) {
        totalTokens = await ctx.runQuery(
          api.messages.getConversationTokenEstimate,
          { conversationId: args.conversationId }
        );
      }

      // Use model context length if available; otherwise default to the cap
      const cap = 100_000; // conservative lower limit across providers
      const modelWindow = fullModel.contextLength || cap;
      const threshold = Math.min(modelWindow, cap);

      if ((totalTokens || 0) > threshold) {
        await ctx.scheduler.runAfter(
          5000,
          internal.conversationSummary.generateMissingSummaries,
          {
            conversationId: args.conversationId,
            forceRegenerate: false,
          }
        );
      }
    } catch (e) {
      log.warn("Failed to schedule token-aware summaries:", e);
    }

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
    const { user } = await getAuthenticatedUserWithDataForAction(ctx);

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
        // Increment user message stats
        await incrementUserMessageStats(
          ctx,
          user._id,
          firstUserMessage.model,
          firstUserMessage.provider
        );
      } catch (error) {
        // If the model doesn't exist in the user's database, skip stats increment
        // This can happen when importing private conversations with models the user no longer has
        log.warn(
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
      citations?: Citation[];
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

    const q = args.searchQuery.trim();
    if (!q) {
      return [];
    }

    const limit = args.limit || 50;
    const needle = q.toLowerCase();

    // Load user's conversations first
    const allUserConversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .collect();

    // Apply archived filter if requested
    const filteredConversations =
      args.includeArchived === false
        ? allUserConversations.filter(c => !c.isArchived)
        : allUserConversations;

    // Title matches (case-insensitive contains)
    const titleMatches = filteredConversations.filter(c =>
      (c.title || "").toLowerCase().includes(needle)
    );

    // Message content matches: scan messages within the user's conversations
    const conversationsFromMessages: typeof filteredConversations = [];
    for (const conv of filteredConversations) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", q => q.eq("conversationId", conv._id))
        .collect();
      if (msgs.some(m => (m.content || "").toLowerCase().includes(needle))) {
        conversationsFromMessages.push(conv);
      }
      if (conversationsFromMessages.length + titleMatches.length >= limit * 2) {
        // Avoid scanning too many in tests; small optimization
        break;
      }
    }

    // Combine and dedupe with title matches first
    const conversationMap = new Map<
      string,
      (typeof filteredConversations)[number]
    >();
    for (const conv of titleMatches) {
      conversationMap.set(conv._id, conv);
    }
    for (const conv of conversationsFromMessages) {
      if (!conversationMap.has(conv._id)) {
        conversationMap.set(conv._id, conv);
      }
    }

    // Sort by updatedAt desc and limit
    const finalResults = Array.from(conversationMap.values()).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
    return finalResults.slice(0, limit);
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const { hasAccess, conversation } = await hasConversationAccess(
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

export const getWithAccessInfo = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const { hasAccess, conversation } = await hasConversationAccess(
      ctx,
      args.id,
      true
    );
    return { hasAccess, conversation, isDeleted: false };
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
    await validateConversationAccess(ctx, args.id, false);

    const patch: Record<string, unknown> = { ...args.updates };
    if (args.setUpdatedAt) {
      // Ensure strictly monotonic updatedAt to satisfy tests that expect a bump
      const existing = await ctx.db.get(args.id);
      const now = Date.now();
      patch.updatedAt = Math.max(now, (existing?.updatedAt || 0) + 1);
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
    // Check if conversation exists before patching (defensive)
    const conversation = await ctx.db.get(args.id);
    if (!conversation) {
      return; // Silent no-op if not found
    }

    const patch: Record<string, unknown> = { ...args.updates };
    if (args.setUpdatedAt) {
      // Ensure strictly monotonic updatedAt to satisfy tests that expect a bump
      const now = Date.now();
      patch.updatedAt = Math.max(now, (conversation.updatedAt || 0) + 1);
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

    // Always start with a neutral placeholder so title generation logic can update it
    const initialTitle =
      !args.title || /new conversation/i.test(args.title)
        ? "New conversation"
        : args.title;

    // Create conversation
    const conversationId = await ctx.db.insert("conversations", {
      title: initialTitle || "New conversation",
      userId: args.userId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Backfill rootConversationId for new conversations in this path
    try {
      await ctx.db.patch(conversationId, {
        rootConversationId: conversationId,
      });
    } catch {
      // Ignore errors if already set
    }

    await withRetry(
      async () => {
        const fresh = await ctx.db.get(args.userId);
        if (!fresh) {
          throw new Error("User not found");
        }
        await ctx.db.patch(args.userId, {
          conversationCount: Math.max(0, (fresh.conversationCount || 0) + 1),
        });
      },
      5,
      25
    );

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
      await incrementUserMessageStats(
        ctx,
        args.userId,
        args.model || "unknown",
        args.provider || "unknown"
      );
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
        0,
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

    // Set rootConversationId to self for new conversations
    try {
      await ctx.db.patch(conversationId, {
        rootConversationId: conversationId,
      });
    } catch {
      // Ignore errors if already set
    }

    await withRetry(
      async () => {
        const fresh = await ctx.db.get(args.userId);
        if (!fresh) {
          throw new Error("User not found");
        }
        await ctx.db.patch(args.userId, {
          conversationCount: Math.max(0, (fresh.conversationCount || 0) + 1),
        });
      },
      5,
      25
    );

    return conversationId;
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    // Check access to the conversation (no shared access for mutations)
    const conversation = await validateConversationAccess(ctx, args.id, false);

    // First, ensure streaming is stopped for this conversation
    try {
      await setConversationStreaming(ctx, args.id, false);
    } catch (error) {
      log.warn(
        `Failed to clear streaming state for conversation ${args.id}:`,
        error
      );
    }

    // Prevent deleting a root conversation if any branches exist
    try {
      const rootId = (conversation.rootConversationId ||
        conversation._id) as Id<"conversations">;
      if (rootId === args.id) {
        const anyBranch = await ctx.db
          .query("conversations")
          .withIndex("by_root_updated", q => q.eq("rootConversationId", rootId))
          .filter(q => q.neq(q.field("_id"), args.id))
          .first();
        if (anyBranch) {
          throw new Error(
            "Cannot delete root conversation while branches exist"
          );
        }
      }
    } catch (e) {
      // Surface error to client
      if (e instanceof Error && e.message.includes("Cannot delete root")) {
        throw e;
      }
    }

    // Get all messages in the conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", args.id))
      .collect();

    // Use the internal messages.removeMultiple mutation which handles attachments and streaming
    if (messages.length > 0) {
      const messageIds = messages.map(m => m._id);
      // We'll delete messages in batches to avoid potential timeouts
      for (let i = 0; i < messageIds.length; i += MESSAGE_BATCH_SIZE) {
        const batch = messageIds.slice(i, i + MESSAGE_BATCH_SIZE);
        await ctx.runMutation(internal.messages.internalRemoveMultiple, {
          ids: batch,
        });
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
        let conversation: Doc<"conversations"> | null = null;
        try {
          conversation = await validateConversationAccess(ctx, id, false);
        } catch {
          results.push({ id, status: "access_denied" });
          continue;
        }

        // First, ensure streaming is stopped for this conversation
        try {
          await setConversationStreaming(ctx, id, false);
        } catch (error) {
          log.warn(
            `Failed to clear streaming state for conversation ${id}:`,
            error
          );
        }

        // Get all messages in the conversation
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q => q.eq("conversationId", id))
          .collect();

        // Use the internal messages.removeMultiple mutation which handles attachments and streaming
        if (messages.length > 0) {
          const messageIds = messages.map(m => m._id);
          // We'll delete messages in batches to avoid potential timeouts
          for (let i = 0; i < messageIds.length; i += MESSAGE_BATCH_SIZE) {
            const batch = messageIds.slice(i, i + MESSAGE_BATCH_SIZE);
            await ctx.runMutation(internal.messages.internalRemoveMultiple, {
              ids: batch,
            });
          }
        }

        // Delete the conversation
        await ctx.db.delete(id);

        // Use atomic decrement for conversation count
        // Note: Message count is already decremented in messages.removeMultiple
        const user = conversation?.userId
          ? await ctx.db.get(conversation.userId)
          : null;
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
    const { user } = await getAuthenticatedUserWithDataForAction(ctx);

    // Validate that the conversation belongs to the authenticated user
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: message.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Additional security check: ensure the conversation belongs to the authenticated user
    if (conversation.userId !== user._id) {
      throw new Error(
        "Access denied: conversation does not belong to authenticated user"
      );
    }

    // Get all messages for the conversation
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: message.conversationId,
    });

    const messageIndex = messages.findIndex(
      (msg: Doc<"messages">) => msg._id === args.messageId
    );
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    // IMPORTANT: Preserve attachments by updating the existing user message
    await ctx.runMutation(internal.messages.updateContent, {
      messageId: args.messageId,
      content: args.newContent,
    });

    // Delete only messages AFTER the edited message
    const messagesToDelete = messages.slice(messageIndex + 1);
    const messageIdsToDelete = messagesToDelete
      .filter((msg: Doc<"messages">) => msg.role !== "context")
      .map((msg: Doc<"messages">) => msg._id);

    if (messageIdsToDelete.length > 0) {
      await ctx.runMutation(api.messages.removeMultiple, {
        ids: messageIdsToDelete,
      });
    }

    // Choose model/provider: prefer the original model stored on the edited message
    // so that we preserve image-capable models used for this branch. Fallback to
    // client-provided overrides only when the message did not record a model.
    const preferredModelId = message.model || args.model;
    const preferredProvider = message.provider || args.provider;
    const normalizedProvider = preferredProvider?.toLowerCase();

    if (normalizedProvider === "replicate") {
      const prompt = args.newContent;

      const subsequentAssistant = messagesToDelete.find(
        (
          msg
        ): msg is Doc<"messages"> & {
          imageGeneration: Doc<"messages">["imageGeneration"];
        } => msg.role === "assistant" && Boolean(msg.imageGeneration)
      );

      const previousMetadata = subsequentAssistant?.imageGeneration?.metadata;
      const candidateModel =
        preferredModelId || (previousMetadata?.model as string | undefined);

      if (!candidateModel) {
        throw new Error(
          "Unable to determine Replicate model for edit. Please choose a model and try again."
        );
      }

      const allowedParamKeys = new Set([
        "aspectRatio",
        "steps",
        "guidanceScale",
        "seed",
        "negativePrompt",
        "count",
      ]);

      const sanitizedParams = previousMetadata?.params
        ? (Object.fromEntries(
            Object.entries(previousMetadata.params).filter(
              ([key, value]) =>
                allowedParamKeys.has(key) &&
                value !== undefined &&
                value !== null
            )
          ) as {
            aspectRatio?: string;
            steps?: number;
            guidanceScale?: number;
            seed?: number;
            negativePrompt?: string;
            count?: number;
          })
        : undefined;

      if (
        message.model !== candidateModel ||
        message.provider?.toLowerCase() !== "replicate"
      ) {
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: message._id,
          model: candidateModel,
          provider: "replicate",
        });
      }

      const imageGenerationMetadata: {
        model: string;
        prompt: string;
        params?: {
          aspectRatio?: string;
          steps?: number;
          guidanceScale?: number;
          seed?: number;
          negativePrompt?: string;
          count?: number;
        };
      } = {
        model: candidateModel,
        prompt,
      };

      if (sanitizedParams && Object.keys(sanitizedParams).length > 0) {
        imageGenerationMetadata.params = sanitizedParams;
      }

      const assistantMessageId = await ctx.runMutation(api.messages.create, {
        conversationId: message.conversationId,
        role: "assistant",
        content: "",
        status: "streaming",
        model: "replicate",
        provider: "replicate",
        imageGeneration: {
          status: "starting",
          metadata: imageGenerationMetadata,
        },
      });

      await ctx.runMutation(internal.conversations.internalPatch, {
        id: message.conversationId,
        updates: { isStreaming: true },
        setUpdatedAt: true,
      });

      await ctx.runAction(api.ai.replicate.generateImage, {
        conversationId: message.conversationId,
        messageId: assistantMessageId,
        prompt,
        model: candidateModel,
        params:
          sanitizedParams && Object.keys(sanitizedParams).length > 0
            ? sanitizedParams
            : undefined,
      });

      return { assistantMessageId };
    }

    // Get user's effective model using centralized resolution with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      preferredModelId,
      preferredProvider
    );

    // Build context messages including the edited message
    await buildContextMessages(ctx, {
      conversationId: message.conversationId,
      personaId: conversation.personaId,
      modelCapabilities: {
        supportsImages: fullModel.supportsImages ?? false,
        supportsFiles: fullModel.supportsFiles ?? false,
      },
    });

    // Create new assistant message for streaming
    const assistantMessageId = await ctx.runMutation(api.messages.create, {
      conversationId: message.conversationId,
      role: "assistant",
      content: "",
      model: fullModel.modelId,
      provider: fullModel.provider,
      status: "thinking",
    });

    // Mark conversation as streaming
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: message.conversationId,
      updates: { isStreaming: true },
    });

    return {
      assistantMessageId,
    };
  },
});

export const retryFromMessage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    retryType: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
    ...modelProviderArgs,
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigSchema),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ assistantMessageId: Id<"messages"> }> => {
    // Get authenticated user
    const { user } = await getAuthenticatedUserWithDataForAction(ctx);

    // Validate that the conversation belongs to the authenticated user
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Additional security check: ensure the conversation belongs to the authenticated user
    if (conversation.userId !== user._id) {
      throw new Error(
        "Access denied: conversation does not belong to authenticated user"
      );
    }

    // Get all messages for the conversation
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: args.conversationId,
    });

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

    // If personaId is provided, update the conversation persona immediately
    const effectivePersonaId = args.personaId ?? conversation.personaId;
    if (args.personaId && args.personaId !== conversation.personaId) {
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { personaId: args.personaId },
        setUpdatedAt: true,
      });
    }

    const requestedModel =
      args.model ?? (targetMessage.model as string | undefined);
    const requestedProvider =
      args.provider ?? (targetMessage.provider as string | undefined);
    const normalizedProvider = requestedProvider?.toLowerCase();

    if (retryType === "assistant") {
      const fullModel = await getUserEffectiveModelWithCapabilities(
        ctx,
        requestedModel,
        requestedProvider
      );
      // Assistant retry: delete messages AFTER this assistant message (preserve context),
      // then clear this assistant message and stream into the SAME messageId

      // Delete messages after the assistant message (preserve context)
      const messagesToDelete = messages.slice(messageIndex + 1);
      for (const msg of messagesToDelete) {
        if (msg.role === "context") {
          continue;
        }
        await ctx.runMutation(api.messages.remove, { id: msg._id });
      }

      // Stop any current streaming first
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: false },
      });

      // Clear the assistant message content and reset ALL streaming-related state
      // Also update model/provider so UI reflects the new selection immediately
      await ctx.runMutation(internal.messages.internalUpdate, {
        id: targetMessage._id,
        content: "",
        reasoning: "", // Clear reasoning by setting to empty string
        citations: [],
        model: fullModel.modelId,
        provider: fullModel.provider as
          | "openai"
          | "anthropic"
          | "google"
          | "groq"
          | "openrouter"
          | "replicate"
          | "elevenlabs",
        metadata: { finishReason: undefined }, // Clear finish reason to allow new streaming
      });

      // Set status to thinking
      await ctx.runMutation(internal.messages.updateMessageStatus, {
        messageId: targetMessage._id,
        status: "thinking",
      });

      // Mark conversation as streaming
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: true },
      });

      // Build context up to the previous user message
      const previousUserMessageIndex = messageIndex - 1;
      const previousUserMessage = messages[previousUserMessageIndex];
      if (!previousUserMessage || previousUserMessage.role !== "user") {
        throw new Error("Cannot find previous user message to retry from");
      }

      // Build context messages for streaming (not used directly but required for consistency)
      await buildContextMessages(ctx, {
        conversationId: args.conversationId,
        personaId: effectivePersonaId,
        includeUpToIndex: previousUserMessageIndex,
        modelCapabilities: {
          supportsImages: fullModel.supportsImages ?? false,
          supportsFiles: fullModel.supportsFiles ?? false,
        },
      });

      return { assistantMessageId: targetMessage._id };
    }

    if (retryType === "user" && normalizedProvider === "replicate") {
      const prompt = targetMessage.content || "";

      const subsequentAssistant = messages
        .slice(messageIndex + 1)
        .find(msg => msg.role === "assistant" && msg.imageGeneration);

      const previousMetadata = subsequentAssistant?.imageGeneration?.metadata;
      const candidateModel =
        requestedModel || (previousMetadata?.model as string | undefined);

      if (!candidateModel) {
        throw new Error(
          "Unable to determine Replicate model for retry. Please choose a model and try again."
        );
      }

      const allowedParamKeys = new Set([
        "aspectRatio",
        "steps",
        "guidanceScale",
        "seed",
        "negativePrompt",
        "count",
      ]);

      const sanitizedParams = previousMetadata?.params
        ? (Object.fromEntries(
            Object.entries(previousMetadata.params).filter(
              ([key, value]) =>
                allowedParamKeys.has(key) &&
                value !== undefined &&
                value !== null
            )
          ) as {
            aspectRatio?: string;
            steps?: number;
            guidanceScale?: number;
            seed?: number;
            negativePrompt?: string;
            count?: number;
          })
        : undefined;

      // Delete messages after the user message (preserve the user message and context)
      await handleMessageDeletion(ctx, messages, messageIndex, "user");

      if (
        targetMessage.model !== candidateModel ||
        targetMessage.provider?.toLowerCase() !== "replicate"
      ) {
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: targetMessage._id,
          model: candidateModel,
          provider: "replicate",
        });
      }

      const imageGenerationMetadata: {
        model: string;
        prompt: string;
        params?: {
          aspectRatio?: string;
          steps?: number;
          guidanceScale?: number;
          seed?: number;
          negativePrompt?: string;
          count?: number;
        };
      } = {
        model: candidateModel,
        prompt,
      };

      if (sanitizedParams && Object.keys(sanitizedParams).length > 0) {
        imageGenerationMetadata.params = sanitizedParams;
      }

      const assistantMessageId = await ctx.runMutation(api.messages.create, {
        conversationId: args.conversationId,
        role: "assistant",
        content: "",
        status: "streaming",
        model: "replicate",
        provider: "replicate",
        imageGeneration: {
          status: "starting",
          metadata: imageGenerationMetadata,
        },
      });

      await ctx.runMutation(internal.conversations.internalPatch, {
        id: args.conversationId,
        updates: { isStreaming: true },
        setUpdatedAt: true,
      });

      await ctx.runAction(api.ai.replicate.generateImage, {
        conversationId: args.conversationId,
        messageId: assistantMessageId,
        prompt,
        model: candidateModel,
        params:
          sanitizedParams && Object.keys(sanitizedParams).length > 0
            ? sanitizedParams
            : undefined,
      });

      return {
        assistantMessageId,
      };
    }

    // User retry: keep the user message, delete messages after it, and create a fresh assistant message
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      requestedModel,
      requestedProvider
    );

    const contextEndIndex = messageIndex;

    // Delete messages after the user message (preserve the user message and context)
    await handleMessageDeletion(ctx, messages, messageIndex, "user");

    // Build context messages up to the retry point
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: effectivePersonaId,
      includeUpToIndex: contextEndIndex,
      modelCapabilities: {
        supportsImages: fullModel.supportsImages ?? false,
        supportsFiles: fullModel.supportsFiles ?? false,
      },
    });

    // Execute streaming action for retry (creates a NEW assistant message)
    const result = await executeStreamingActionForRetry(ctx, {
      conversationId: args.conversationId,
      model: fullModel.modelId,
      provider: fullModel.provider,
      conversation: { ...conversation, personaId: effectivePersonaId },
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
    const { user } = await getAuthenticatedUserWithDataForAction(ctx);

    // Validate that the conversation belongs to the authenticated user
    const conversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }

    // Additional security check: ensure the conversation belongs to the authenticated user
    if (conversation.userId !== user._id) {
      throw new Error(
        "Access denied: conversation does not belong to authenticated user"
      );
    }

    // Get all messages for the conversation
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: args.conversationId,
    });

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
    await ctx.runMutation(internal.messages.updateContent, {
      messageId: args.messageId,
      content: args.newContent,
    });

    // Delete all messages after the edited message (use user retry logic)
    await handleMessageDeletion(ctx, messages, messageIndex, "user");

    // Prefer the original model/provider recorded on the edited message
    const preferredModelId = targetMessage.model || args.model;
    const preferredProvider = targetMessage.provider || args.provider;

    // Get user's effective model using centralized resolution with full capabilities
    const fullModel = await getUserEffectiveModelWithCapabilities(
      ctx,
      preferredModelId,
      preferredProvider
    );

    // Build context messages including the edited message
    const { contextMessages } = await buildContextMessages(ctx, {
      conversationId: args.conversationId,
      personaId: conversation.personaId,
      modelCapabilities: {
        supportsImages: fullModel.supportsImages ?? false,
        supportsFiles: fullModel.supportsFiles ?? false,
      },
    });

    // Execute streaming action for retry
    const result = await executeStreamingActionForRetry(ctx, {
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
    // Mark the conversation as not streaming to signal completion
    await setConversationStreaming(ctx, args.conversationId, false);

    // Also mark any streaming message as stopped
    await stopConversationStreaming(ctx, args.conversationId);
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
    assistantMessageId?: Id<"messages">;
  }> => {
    // Get authenticated user ID first
    let authenticatedUserId: Id<"users"> | null = null;
    try {
      const { userId } = await getAuthenticatedUserWithDataForAction(ctx);
      authenticatedUserId = userId;
    } catch (error) {
      log.warn("Failed to get authenticated user:", error);
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

    const [selectedModel, user] = await Promise.all([
      ctx.runQuery(api.userModels.getUserSelectedModel),
      ctx.runQuery(api.users.getById, { id: actualUserId }),
    ]);

    if (!selectedModel) {
      throw new Error("No model selected. Please select a model in Settings.");
    }
    if (!user) {
      throw new Error("User not found");
    }

    // Check if it's a built-in free model and enforce limits
    // If model has 'free' field, it's from builtInModels table and is a built-in model
    const isBuiltInModelResult = selectedModel.free === true;

    if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
      await validateMonthlyMessageLimitForAction(ctx, user);
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

    // Note: createWithUserId already increments user stats; avoid double increment here

    // Create context message FIRST if contextSummary is provided
    // This must happen before streaming so the AI can see the context
    if (args.sourceConversationId && args.contextSummary) {
      await ctx.runMutation(api.messages.create, {
        conversationId: createResult.conversationId,
        role: "context",
        content: `Prior context: ${args.contextSummary}`,
        sourceConversationId: args.sourceConversationId,
        isMainBranch: true,
      });
    }

    // **CRITICAL**: Trigger streaming for the assistant response!
    // This happens AFTER context is added so AI can see the full conversation
    if (args.firstMessage && args.firstMessage.trim().length > 0) {
      const [_fullModel] = await Promise.all([
        getUserEffectiveModelWithCapabilities(
          ctx,
          selectedModel.modelId,
          actualProvider
        ),

        // Mark conversation as streaming
        setConversationStreamingForAction(
          ctx,
          createResult.conversationId,
          true
        ),
      ]);
    }

    return {
      conversationId: createResult.conversationId,
      userId: actualUserId,
      isNewUser,
      // Expose assistantMessageId so the client can kick off HTTP streaming
      assistantMessageId: createResult.assistantMessageId,
    };
  },
});

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
      await getUserEffectiveModelWithCapabilities(
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

      // Kick off title generation immediately (action -> action), so UI updates fast
      try {
        await ctx.runAction(api.titleGeneration.generateTitleBackground, {
          conversationId: result.conversationId,
          message: args.firstMessage,
        });
      } catch {
        // Best-effort; server already scheduled a background job
      }

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
 * Set conversation streaming state
 */
export const setStreaming = mutation({
  args: {
    conversationId: v.id("conversations"),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    // When starting streaming (i.e., a new user message), bump updatedAt
    await ctx.db.patch(args.conversationId, {
      isStreaming: args.isStreaming,
      ...(args.isStreaming ? { updatedAt: Date.now() } : {}),
    });
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

// Re-export background operations for API compatibility
export {
  scheduleBackgroundImport,
  scheduleBackgroundBulkDelete,
  processBulkDelete,
};
