import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { withRetry } from "../../ai/error_handlers";
import {
  getAuthenticatedUser,
  getAuthenticatedUserWithData,
} from "../shared_utils";

/**
 * Handler for incrementing user message statistics.
 */
export async function incrementMessageHandler(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    model: string;
    provider: string;
    tokensUsed?: number;
    countTowardsMonthly?: boolean;
  }
) {
  await withRetry(
    async () => {
      const fresh = await ctx.db.get("users", args.userId);
      if (!fresh) {
        throw new Error("User not found");
      }

      const countTowardsMonthly = args.countTowardsMonthly ?? false;

      const updates: {
        messagesSent: number;
        monthlyMessagesSent: number;
        totalMessageCount: number;
      } = {
        messagesSent: (fresh.messagesSent || 0) + 1,
        monthlyMessagesSent:
          (fresh.monthlyMessagesSent || 0) + (countTowardsMonthly ? 1 : 0),
        totalMessageCount: (fresh.totalMessageCount || 0) + 1,
      };

      await ctx.db.patch("users", args.userId, updates);
    },
    5,
    25
  );
}

/**
 * Handler for internal patch operations (system operations only).
 */
export function internalPatchHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"users">;
    // biome-ignore lint/suspicious/noExplicitAny: internal system operation accepts arbitrary updates
    updates: any;
  }
) {
  const patch: Record<string, unknown> = { ...args.updates };
  return ctx.db.patch("users", args.id, patch);
}

/**
 * Handler for updating user profile.
 */
export async function updateProfileHandler(
  ctx: MutationCtx,
  args: {
    name?: string;
    image?: string;
  }
) {
  const { userId } = await getAuthenticatedUserWithData(ctx);

  const updates: { name?: string; image?: string } = {};

  if (args.name !== undefined) {
    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name cannot be empty");
    }
    if (trimmedName.length > 100) {
      throw new Error("Name cannot exceed 100 characters");
    }
    updates.name = trimmedName;
  }

  if (args.image !== undefined) {
    updates.image = args.image;
  }

  if (Object.keys(updates).length > 0) {
    await ctx.db.patch("users", userId, updates);
  }

  return { success: true };
}

const MESSAGE_DELETE_BATCH_SIZE = 50;

async function deleteMessagesInBatches(
  ctx: MutationCtx,
  messageIds: Id<"messages">[]
) {
  for (let i = 0; i < messageIds.length; i += MESSAGE_DELETE_BATCH_SIZE) {
    const batch = messageIds.slice(i, i + MESSAGE_DELETE_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }
    await ctx.runMutation(internal.messages.internalRemoveMultiple, {
      ids: batch,
    });
  }
}

/**
 * Cascade-delete all data owned by a user.
 * Shared by deleteAccountHandler (authenticated) and internalDeleteUserData (webhook).
 */
export async function cascadeDeleteUserData(
  ctx: MutationCtx,
  userId: Id<"users">
) {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_user_recent", q => q.eq("userId", userId))
    .collect();

  for (const conversation of conversations) {
    const conversationId = conversation._id;

    const sharedCopies = await ctx.db
      .query("sharedConversations")
      .withIndex("by_original_conversation", q =>
        q.eq("originalConversationId", conversationId)
      )
      .collect();
    for (const shared of sharedCopies) {
      await ctx.db.delete("sharedConversations", shared._id);
    }

    const summaries = await ctx.db
      .query("conversationSummaries")
      .withIndex("by_conversation_updated", q =>
        q.eq("conversationId", conversationId)
      )
      .collect();
    for (const summary of summaries) {
      await ctx.db.delete("conversationSummaries", summary._id);
    }

    const favorites = await ctx.db
      .query("messageFavorites")
      .withIndex("by_user_conversation", q =>
        q.eq("userId", userId).eq("conversationId", conversationId)
      )
      .collect();
    for (const favorite of favorites) {
      await ctx.db.delete("messageFavorites", favorite._id);
    }

    const messageIds = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q =>
        q.eq("conversationId", conversationId)
      )
      .collect()
      .then(messages => messages.map(message => message._id));

    if (messageIds.length > 0) {
      await deleteMessagesInBatches(ctx, messageIds);
    }

    await ctx.db.delete("conversations", conversationId);
  }

  const remainingFavorites = await ctx.db
    .query("messageFavorites")
    .withIndex("by_user_created", q => q.eq("userId", userId))
    .collect();
  for (const favorite of remainingFavorites) {
    await ctx.db.delete("messageFavorites", favorite._id);
  }

  const sharedByUser = await ctx.db
    .query("sharedConversations")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  for (const shared of sharedByUser) {
    await ctx.db.delete("sharedConversations", shared._id);
  }

  // Delete background jobs directly (not via auth-gated public mutation,
  // since this may run from webhook context without authenticated user).
  const backgroundJobs = await ctx.db
    .query("backgroundJobs")
    .withIndex("by_user_id", q => q.eq("userId", userId))
    .collect();
  for (const job of backgroundJobs) {
    if (job.fileStorageId) {
      try {
        await ctx.storage.delete(job.fileStorageId);
      } catch (error) {
        console.warn(
          `Failed to delete file for background job ${job.jobId}:`,
          error
        );
      }
    }
    await ctx.db.delete("backgroundJobs", job._id);
  }

  const userSettingsDocs = await ctx.db
    .query("userSettings")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  for (const userSettingsDoc of userSettingsDocs) {
    await ctx.db.delete("userSettings", userSettingsDoc._id);
  }

  const personaSettings = await ctx.db
    .query("userPersonaSettings")
    .withIndex("by_user_persona", q => q.eq("userId", userId))
    .collect();
  for (const personaSetting of personaSettings) {
    await ctx.db.delete("userPersonaSettings", personaSetting._id);
  }

  const personas = await ctx.db
    .query("personas")
    .withIndex("by_user_active", q => q.eq("userId", userId))
    .collect();
  for (const persona of personas) {
    await ctx.db.delete("personas", persona._id);
  }

  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  for (const model of userModels) {
    await ctx.db.delete("userModels", model._id);
  }

  const userImageModels = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  for (const model of userImageModels) {
    await ctx.db.delete("userImageModels", model._id);
  }

  const userApiKeys = await ctx.db
    .query("userApiKeys")
    .withIndex("by_user_provider", q => q.eq("userId", userId))
    .collect();
  for (const key of userApiKeys) {
    await ctx.db.delete("userApiKeys", key._id);
  }

  const userMemories = await ctx.db
    .query("userMemories")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  for (const memory of userMemories) {
    await ctx.db.delete("userMemories", memory._id);
  }

  await ctx.db.delete("users", userId);

  return { deletedConversations: conversations.length };
}

/**
 * Handler for deleting a user account and all associated data.
 */
export async function deleteAccountHandler(ctx: MutationCtx) {
  const userId = await getAuthenticatedUser(ctx);

  try {
    const result = await cascadeDeleteUserData(ctx, userId);
    return { success: true, ...result };
  } catch (error) {
    console.error("Failed to delete account:", error);
    throw new Error("Failed to delete account");
  }

}

/**
 * Handler for internal cascade deletion (used by Clerk webhook).
 * Accepts userId directly — no auth check.
 */
export async function internalDeleteUserDataHandler(
  ctx: MutationCtx,
  args: { userId: Id<"users"> }
) {
  await cascadeDeleteUserData(ctx, args.userId);
}
