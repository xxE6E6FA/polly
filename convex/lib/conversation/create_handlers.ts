import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { ImageModelInfo } from "../../ai/tools";
import { withRetry } from "../../ai/error_handlers";
import { toImageModelInfos } from "./helpers";
import { incrementUserMessageStats } from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import {
  createDefaultConversationFields,
  createDefaultMessageFields,
  getAuthenticatedUserWithData,
  setConversationStreaming,
  validateAuthenticatedUser,
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
    reasoningConfig?: {
      enabled: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
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
