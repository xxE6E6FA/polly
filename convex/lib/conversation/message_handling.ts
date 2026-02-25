import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "../auth";
import type { CreateMessageArgs } from "../schemas";
import { api, internal } from "../../_generated/api";
import { mergeSystemPrompts } from "@shared/system-prompts";
import { scheduleRunAfter } from "../scheduler";

// Helper function to handle message deletion logic for retry and edit operations
export const handleMessageDeletion = async (
  ctx: ActionCtx,
  messages: Doc<"messages">[],
  messageIndex: number,
  retryType: "user" | "assistant",
) => {
  if (retryType === "assistant") {
    // For assistant retry, delete the assistant message itself AND everything after it
    // BUT preserve context messages
    const messagesToDelete = messages.slice(messageIndex);
    for (const msg of messagesToDelete) {
      // NEVER delete context messages - they should persist across retries
      if (msg.role === "context") {
        continue;
      }
      await ctx.runMutation(api.messages.remove, { id: msg._id });
    }
  } else {
    // For user retry, delete messages after the user message (but keep the user message)
    const userMessage = messages[messageIndex];
    if (userMessage) {
      // For edit operations, we need to delete:
      // 1. The immediate assistant response to the original user message
      // 2. All messages after the edited user message

      const messageIdsToDelete = [];

      // Find the assistant response immediately following the user message
      if (messageIndex + 1 < messages.length) {
        const nextMessage = messages[messageIndex + 1];
        if (nextMessage?.role === "assistant") {
          messageIdsToDelete.push(nextMessage._id);
        }
      }

      // Get all messages after the user message
      const messagesToDelete = messages.slice(messageIndex + 1);
      const additionalMessageIds = messagesToDelete
        .filter((msg) => msg.role !== "context") // Don't delete context messages
        .map((msg) => msg._id);

      messageIdsToDelete.push(...additionalMessageIds);

      if (messageIdsToDelete.length > 0) {
        await ctx.runMutation(api.messages.removeMultiple, {
          ids: messageIdsToDelete,
        });
      }
    }
  }
};

// DRY Helper: Fetch persona prompt if needed
export async function getPersonaPrompt(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  personaId?: Id<"personas"> | null,
): Promise<string> {
  if (!personaId) {
    return "";
  }

  const persona = await ctx.runQuery(api.personas.get, { id: personaId });
  return persona?.prompt || "";
}

// DRY Helper: Create a message (works for both ActionCtx and MutationCtx)
export async function createMessage(
  ctx: ActionCtx | MutationCtx,
  args: CreateMessageArgs,
): Promise<Id<"messages">> {
  return (await ctx.runMutation(api.messages.create, args)) as Id<"messages">;
}

export async function incrementUserMessageStats(
  ctx: ActionCtx | MutationCtx,
  userId: Id<"users">,
  model: string,
  provider: string,
  tokensUsed?: number,
  options?: { countTowardsMonthly?: boolean },
): Promise<void> {
  try {
    let countTowardsMonthly = options?.countTowardsMonthly;

    if (countTowardsMonthly === undefined) {
      const canRunQuery =
        typeof (ctx as { runQuery?: unknown }).runQuery === "function";
      if (canRunQuery) {
        try {
          const modelLookup =
            (api.userModels &&
              (api.userModels as Record<string, unknown>).getModelByID) ??
            "userModels.getModelByID";
          const modelDoc = await (ctx as ActionCtx | MutationCtx).runQuery(
            modelLookup as any,
            {
              modelId: model,
              provider,
            },
          );
          countTowardsMonthly = Boolean(modelDoc?.free);
        } catch (lookupError) {
          console.warn(
            "[incrementUserMessageStats] Failed to determine model free status:",
            lookupError,
          );
          countTowardsMonthly = false;
        }
      } else {
        countTowardsMonthly = false;
      }
    }

    // Schedule increment off the critical path to reduce contention
    await scheduleRunAfter(ctx, 50, internal.users.incrementMessage, {
      userId,
      model,
      provider,
      tokensUsed: tokensUsed || 0,
      countTowardsMonthly: countTowardsMonthly ?? false,
    });
  } catch (error) {
    // Log error but don't fail the operation
    console.warn("Failed to increment user message stats:", error);
  }
}

// DRY Helper: Merge baseline instructions with persona prompt
export { mergeSystemPrompts };

// Overloaded function for access control
export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  allowSharedAccess: boolean,
): Promise<{
  hasAccess: boolean;
  conversation: Doc<"conversations"> | null;
  isDeleted?: boolean;
}>;

export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversations">>;

export async function checkConversationAccess(
  ctx: QueryCtx | ActionCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userIdOrAllowShared?: Id<"users"> | boolean,
): Promise<
  | Doc<"conversations">
  | {
      hasAccess: boolean;
      conversation: Doc<"conversations"> | null;
      isDeleted?: boolean;
    }
> {
  if (typeof userIdOrAllowShared === "boolean") {
    // New overload: return access info object
    // Note: allowSharedAccess parameter is reserved for future use

    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        return { hasAccess: false, conversation: null };
      }

      const conversation =
        "db" in ctx
          ? await ctx.db.get("conversations", conversationId)
          : await ctx.runQuery(api.conversations.get, { id: conversationId });
      if (!conversation) {
        return { hasAccess: false, conversation: null, isDeleted: true };
      }

      const hasAccess = conversation.userId === userId; // For now, only owner has access
      return {
        hasAccess,
        conversation: hasAccess ? conversation : null,
        isDeleted: false,
      };
    } catch (error) {
      return { hasAccess: false, conversation: null };
    }
  } else {
    // Legacy overload: return conversation or throw
    const userId = userIdOrAllowShared;
    const effectiveUserId = userId || (await getAuthUserId(ctx));

    if (!effectiveUserId) {
      throw new ConvexError("Not authenticated");
    }

    const conversation =
      "db" in ctx
        ? await ctx.db.get("conversations", conversationId)
        : await ctx.runQuery(api.conversations.get, { id: conversationId });

    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    if (conversation.userId !== effectiveUserId) {
      throw new ConvexError("Access denied");
    }

    return conversation;
  }
}
