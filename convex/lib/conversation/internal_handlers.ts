import { MESSAGE_BATCH_SIZE } from "../../../shared/constants";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import { incrementUserMessageStats } from "../conversation_utils";
import { scheduleRunAfter } from "../scheduler";
import { setConversationStreaming } from "../shared_utils";

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
