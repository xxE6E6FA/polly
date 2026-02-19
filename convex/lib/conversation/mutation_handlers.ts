import { MESSAGE_BATCH_SIZE } from "../../../shared/constants";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { ImageModelInfo } from "../../ai/tools";
import { withRetry } from "../../ai/error_handlers";
import { toImageModelInfos } from "./helpers";
import { incrementUserMessageStats } from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import {
  createDefaultConversationFields,
  createDefaultMessageFields,
  getAuthenticatedUser,
  getAuthenticatedUserWithData,
  setConversationStreaming,
  validateAuthenticatedUser,
  validateConversationAccess,
  validateFreeModelUsage,
  validateTitleLength,
  validateUserMessageLength,
} from "../shared_utils";
export async function createConversationHandler(
  ctx: MutationCtx,
  args: {
    title?: string;
    personaId?: Id<"personas">;
    sourceConversationId?: Id<"conversations">;
    firstMessage: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    model?: string;
    provider?: string;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  }
) {
  // Validate title length if provided
  validateTitleLength(args.title);

  const [user, fullModel] = await Promise.all([
    validateAuthenticatedUser(ctx),
    getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider),
  ]);
  const userId = user._id as Id<"users">;

  // Check if this is a built-in free model and enforce limits
  // If model has 'free' field, it's from builtInModels table and is a built-in model
  const isBuiltInModelResult = fullModel.free === true;

  if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
    validateFreeModelUsage(user);
  }

  // Always start with a neutral placeholder so title generation logic can update it
  const initialTitle = args.title ?? "New conversation";

  // Create conversation
  const conversationId = await ctx.db.insert(
    "conversations",
    createDefaultConversationFields(userId, {
      title: initialTitle,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
    })
  );

  // Backfill rootConversationId on creation for new conversations
  try {
    await ctx.db.patch("conversations", conversationId, {
      rootConversationId: conversationId,
    });
  } catch {
    // Ignore errors if already set
  }

  // Update user conversation count with retry to avoid conflicts
  await withRetry(
    async () => {
      const freshUser = await ctx.db.get("users", userId);
      if (!freshUser) {
        throw new Error("User not found");
      }
      await ctx.db.patch("users", userId, {
        conversationCount: Math.max(0, (freshUser.conversationCount || 0) + 1),
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
    createDefaultMessageFields(conversationId, user._id, {
      role: "user",
      content: args.firstMessage,
      attachments: args.attachments,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
    })
  );

  // Create file entries for attachments if any
  if (args.attachments && args.attachments.length > 0) {
    await ctx.runMutation(internal.fileStorage.createUserFileEntries, {
      userId: user._id,
      messageId: userMessageId,
      conversationId,
      attachments: args.attachments,
    });
  }

  // Resolve persona snapshot for the assistant message (frozen at creation time)
  let personaName: string | undefined;
  let personaIcon: string | undefined;
  if (args.personaId) {
    const persona = await ctx.db.get("personas", args.personaId);
    if (persona) {
      personaName = persona.name;
      personaIcon = persona.icon ?? undefined;
    }
  }

  // Create assistant message directly (avoid extra mutation call)
  // Set initial status to "thinking" to ensure UI treats it as live before HTTP stream flips to "streaming"
  const assistantMessageFields = createDefaultMessageFields(
    conversationId,
    user._id,
    {
      role: "assistant",
      content: "",
      model: fullModel.modelId,
      provider: fullModel.provider,
      status: "thinking",
    }
  );
  const assistantMessageId = await ctx.db.insert("messages", {
    ...assistantMessageFields,
    personaName,
    personaIcon,
  });

  // Increment rolling token estimate and messageCount for the first user + assistant messages
  try {
    const delta = Math.max(1, Math.ceil((args.firstMessage || "").length / 4));
    await withRetry(
      async () => {
        const fresh = await ctx.db.get("conversations", conversationId);
        if (!fresh) {
          return;
        }
        await ctx.db.patch("conversations", conversationId, {
          tokenEstimate: Math.max(0, (fresh.tokenEstimate || 0) + delta),
          messageCount: 2, // Both user and assistant messages created
        });
      },
      5,
      25
    );
  } catch {
    // best-effort; ignore failures
  }

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

    // Schedule title generation
    await scheduleRunAfter(
      ctx,
      0,
      api.titleGeneration.generateTitleBackground,
      {
        conversationId,
        message: args.firstMessage,
      }
    );

    // Schedule message streaming
    // Note: File attachments use retry-with-backoff in convertStorageToData
    // to handle potential storage consistency delays
    const streamingMessages = [
      {
        role: "user",
        content:
          args.attachments && args.attachments.length > 0
            ? [{ type: "text", text: args.firstMessage }, ...args.attachments]
            : args.firstMessage,
      },
    ];

    // Query image models if the text model supports tools
    let imageModelsForTools: ImageModelInfo[] | undefined;
    if (fullModel.supportsTools) {
      const userImageModels = await ctx.db
        .query("userImageModels")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      imageModelsForTools = toImageModelInfos(userImageModels);
    }

    await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
      messageId: assistantMessageId,
      conversationId,
      model: fullModel.modelId,
      provider: fullModel.provider,
      messages: streamingMessages,
      personaId: args.personaId,
      reasoningConfig: args.reasoningConfig,
      // Pass model capabilities from mutation context where auth is available
      supportsTools: fullModel.supportsTools ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
      supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
      imageModels: imageModelsForTools,
      userId,
    });
  }
  return {
    conversationId,
    userMessageId,
    assistantMessageId,
    user,
  };
}

export async function patchHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"conversations">;
    updates: Record<string, unknown>;
    setUpdatedAt?: boolean;
  }
) {
  // Check access to the conversation (no shared access for mutations)
  await validateConversationAccess(ctx, args.id, false);

  // Validate title length if title is being updated
  if ("title" in args.updates && typeof args.updates.title === "string") {
    validateTitleLength(args.updates.title);
  }

  const patch: Record<string, unknown> = { ...args.updates };
  if (args.setUpdatedAt) {
    // Ensure strictly monotonic updatedAt to satisfy tests that expect a bump
    const existing = await ctx.db.get("conversations", args.id);
    const now = Date.now();
    patch.updatedAt = Math.max(now, (existing?.updatedAt || 0) + 1);
  }
  return ctx.db.patch("conversations", args.id, patch);
}

export async function internalPatchHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"conversations">;
    updates: Record<string, unknown>;
    setUpdatedAt?: boolean;
    clearFields?: string[];
  }
) {
  await withRetry(async () => {
    // Check if conversation exists before patching (defensive)
    const conversation = await ctx.db.get("conversations", args.id);
    if (!conversation) {
      return; // Silent no-op if not found
    }

    const patch: Record<string, unknown> = { ...args.updates };

    // Apply explicit field deletions (undefined inside handler = actual deletion)
    if (args.clearFields) {
      for (const field of args.clearFields) {
        patch[field] = undefined;
      }
    }

    if (args.setUpdatedAt) {
      // Ensure strictly monotonic updatedAt to satisfy tests that expect a bump
      const now = Date.now();
      patch.updatedAt = Math.max(now, (conversation.updatedAt || 0) + 1);
    }
    await ctx.db.patch("conversations", args.id, patch);
  });
}

export async function internalGetHandler(
  ctx: QueryCtx,
  args: { id: Id<"conversations"> }
) {
  return await ctx.db.get("conversations", args.id);
}

/**
 * Conditionally clear streaming state only if this message is the current streaming message.
 * This prevents race conditions where an old streaming action's finally block
 * could interfere with a new streaming action that has already started.
 */
export const clearStreamingForMessageHandler = async (
  ctx: MutationCtx,
  args: { conversationId: Id<"conversations">; messageId: Id<"messages"> }
) => {
  const conversation = await ctx.db.get("conversations", args.conversationId);
  if (!conversation) {
    return;
  }

  // Only clear streaming state if this message is the current streaming message.
  // If currentStreamingMessageId doesn't match, another streaming action has started
  // and we should not interfere with it.
  if (conversation.currentStreamingMessageId === args.messageId) {
    await ctx.db.patch("conversations", args.conversationId, {
      isStreaming: false,
      currentStreamingMessageId: undefined,
      stopRequested: undefined,
    });
  }
};

export async function createWithUserIdHandler(
  ctx: MutationCtx,
  args: {
    title?: string;
    userId: Id<"users">;
    personaId?: Id<"personas">;
    sourceConversationId?: Id<"conversations">;
    firstMessage: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    useWebSearch?: boolean;
    model?: string;
    provider?: string;
    reasoningConfig?: { enabled: boolean };
  }
) {
  const user = await ctx.db.get("users", args.userId);
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
    await ctx.db.patch("conversations", conversationId, {
      rootConversationId: conversationId,
    });
  } catch {
    // Ignore errors if already set
  }

  await withRetry(
    async () => {
      const fresh = await ctx.db.get("users", args.userId);
      if (!fresh) {
        throw new Error("User not found");
      }
      await ctx.db.patch("users", args.userId, {
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
    userId: args.userId,
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

  // Resolve persona snapshot for the assistant message
  let personaName: string | undefined;
  let personaIcon: string | undefined;
  const convo = await ctx.db.get("conversations", conversationId);
  if (convo?.personaId) {
    const persona = await ctx.db.get("personas", convo.personaId);
    if (persona) {
      personaName = persona.name;
      personaIcon = persona.icon ?? undefined;
    }
  }

  // Create empty assistant message for streaming with status: "thinking"
  // This ensures proper streaming state from the start
  const assistantMessageId = await ctx.db.insert("messages", {
    conversationId,
    role: "assistant",
    content: "",
    status: "thinking",
    userId: args.userId,
    model: args.model,
    provider: args.provider,
    personaName,
    personaIcon,
    isMainBranch: true,
    createdAt: Date.now(),
  });

  // Update messageCount for the conversation (2 messages: user + assistant)
  await ctx.db.patch("conversations", conversationId, { messageCount: 2 });

  // Schedule title generation and streaming in the background
  if (args.firstMessage && args.firstMessage.trim().length > 0) {
    await scheduleRunAfter(
      ctx,
      0,
      api.titleGeneration.generateTitleBackground,
      {
        conversationId,
        message: args.firstMessage,
      }
    );

    // Build context messages for streaming
    const _userMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", conversationId)
      )
      .filter(q => q.eq(q.field("role"), "user"))
      .collect();

    // Simple context: just the user message
    const contextMessages = [
      {
        role: "user",
        content: args.firstMessage,
      },
    ];

    // Schedule server-side streaming
    // Note: No model capabilities available in this internal mutation path
    await scheduleRunAfter(ctx, 0, internal.streaming_actions.streamMessage, {
      messageId: assistantMessageId,
      conversationId,
      model: args.model || "unknown",
      provider: args.provider || "unknown",
      messages: contextMessages,
      personaId: args.personaId,
      reasoningConfig: args.reasoningConfig,
      supportsTools: false,
      supportsFiles: false,
    });
  }

  return {
    conversationId,
    userMessageId,
    assistantMessageId,
    user,
  };
}

export async function createEmptyInternalHandler(
  ctx: MutationCtx,
  args: {
    title?: string;
    userId: Id<"users">;
    personaId?: Id<"personas">;
    clientId?: string;
  }
) {
  const user = await ctx.db.get("users", args.userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Create empty conversation
  const conversationId = await ctx.db.insert("conversations", {
    title: args.title ?? "New Conversation",
    userId: args.userId,
    personaId: args.personaId,
    clientId: args.clientId,
    isStreaming: false,
    isArchived: false,
    isPinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Set rootConversationId to self for new conversations
  try {
    await ctx.db.patch("conversations", conversationId, {
      rootConversationId: conversationId,
    });
  } catch {
    // Ignore errors if already set
  }

  await withRetry(
    async () => {
      const fresh = await ctx.db.get("users", args.userId);
      if (!fresh) {
        throw new Error("User not found");
      }
      await ctx.db.patch("users", args.userId, {
        conversationCount: Math.max(0, (fresh.conversationCount || 0) + 1),
      });
    },
    5,
    25
  );

  return conversationId;
}

export async function createEmptyHandler(
  ctx: MutationCtx,
  args: {
    clientId: string;
    personaId?: Id<"personas">;
  }
) {
  const { userId, user } = await getAuthenticatedUserWithData(ctx);

  // Create empty conversation with clientId for optimistic lookup
  const conversationId = await ctx.db.insert("conversations", {
    title: "New Conversation",
    userId,
    personaId: args.personaId,
    clientId: args.clientId,
    isStreaming: false,
    isArchived: false,
    isPinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Set rootConversationId to self
  await ctx.db.patch("conversations", conversationId, {
    rootConversationId: conversationId,
  });

  // Update user conversation count
  await ctx.db.patch("users", userId, {
    conversationCount: Math.max(0, (user.conversationCount || 0) + 1),
  });

  return conversationId;
}

export async function removeHandler(
  ctx: MutationCtx,
  args: { id: Id<"conversations"> }
) {
  // Check access to the conversation (no shared access for mutations)
  const conversation = await validateConversationAccess(ctx, args.id, false);

  // First, ensure streaming is stopped for this conversation
  try {
    await setConversationStreaming(ctx, args.id, false);
  } catch (error) {
    console.warn(
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
  const result = await ctx.db.delete("conversations", args.id);

  // Use atomic decrement for conversation count
  const user = await ctx.db.get("users", conversation?.userId);
  if (user && "conversationCount" in user) {
    await ctx.db.patch("users", user._id, {
      conversationCount: Math.max(0, (user.conversationCount || 0) - 1),
    });
  }

  return result;
}

export async function bulkRemoveHandler(
  ctx: MutationCtx,
  args: { ids: Id<"conversations">[] }
) {
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
      await ctx.db.delete("conversations", id);

      // Use atomic decrement for conversation count
      // Note: Message count is already decremented in messages.removeMultiple
      const user = conversation?.userId
        ? await ctx.db.get("users", conversation.userId)
        : null;
      if (user && "conversationCount" in user) {
        await ctx.db.patch("users", user._id, {
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
}

export async function internalBulkRemoveHandler(
  ctx: MutationCtx,
  args: {
    ids: Id<"conversations">[];
    userId: Id<"users">;
  }
) {
  const results = [];
  for (const id of args.ids) {
    // Verify the conversation exists and belongs to the specified user
    const conversation = await ctx.db.get("conversations", id);
    if (!conversation) {
      results.push({ id, status: "not_found" });
      continue;
    }
    if (conversation.userId !== args.userId) {
      results.push({ id, status: "access_denied" });
      continue;
    }

    // First, ensure streaming is stopped for this conversation
    try {
      await setConversationStreaming(ctx, id, false);
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
    await ctx.db.delete("conversations", id);

    // Use atomic decrement for conversation count
    // Note: Message count is already decremented in messages.removeMultiple
    const user = await ctx.db.get("users", args.userId);
    if (user && "conversationCount" in user) {
      await ctx.db.patch("users", user._id, {
        conversationCount: Math.max(0, (user.conversationCount || 0) - 1),
      });
    }
    results.push({ id, status: "deleted" });
  }
  return results;
}

export const stopGenerationHandler = async (
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    content?: string;
    reasoning?: string;
  }
) => {
  const userId = await getAuthenticatedUser(ctx);

  const conversation = await ctx.db.get("conversations", args.conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (conversation.userId !== userId) {
    throw new Error("Access denied");
  }

  // Set stopRequested signal - this is ALL we do.
  // NO message reads to avoid OCC conflicts with streaming updates.
  // The streaming action checks stopRequested and finalizes the message.
  await ctx.db.patch("conversations", args.conversationId, {
    isStreaming: false,
    stopRequested: Date.now(),
  });

  // For image generation: check conversation-level tracking (no message query needed)
  if (conversation.activeImageGeneration?.replicateId) {
    await ctx.scheduler.runAfter(0, internal.ai.replicate.cancelPrediction, {
      predictionId: conversation.activeImageGeneration.replicateId,
      messageId: conversation.activeImageGeneration.messageId,
    });
  }
};

export async function setStreamingHandler(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    isStreaming: boolean;
    messageId?: Id<"messages">;
  }
) {
  // When starting streaming (i.e., a new user message), bump updatedAt
  // and clear any previous stop request to ensure fresh streaming state
  // Use retry logic to handle concurrent updates to the conversation (e.g., tokenEstimate updates)
  await withRetry(
    async () => {
      await ctx.db.patch("conversations", args.conversationId, {
        isStreaming: args.isStreaming,
        ...(args.isStreaming
          ? {
              updatedAt: Date.now(),
              stopRequested: undefined,
              currentStreamingMessageId: args.messageId,
            }
          : {
              currentStreamingMessageId: undefined,
            }),
      });
    },
    5,
    25
  );
}
