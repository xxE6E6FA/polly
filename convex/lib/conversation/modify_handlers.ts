import { MESSAGE_BATCH_SIZE } from "../../../shared/constants";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import {
  getAuthenticatedUser,
  setConversationStreaming,
  validateConversationAccess,
  validateTitleLength,
} from "../shared_utils";

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
