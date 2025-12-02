import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { withRetry } from "./ai/error_handlers";

// Shared handler for creating anonymous users
export async function handleCreateAnonymousUser(ctx: MutationCtx) {
  const now = Date.now();

  return await ctx.db.insert("users", {
    isAnonymous: true,
    createdAt: now,
    messagesSent: 0,
    monthlyMessagesSent: 0,
    conversationCount: 0,
    totalMessageCount: 0,
  });
}

// Shared handler for getting user by ID
export async function handleGetUserById(ctx: QueryCtx, id: Id<"users">) {
  return await ctx.db.get(id);
}

export async function currentHandler(ctx: QueryCtx) {
  // First try to get the authenticated user ID (works for both anonymous and regular users)
  const userId = await getAuthUserId(ctx);

  if (userId) {
    return await ctx.db.get(userId);
  }

  // If no authenticated user, return null
  // Don't try to find anonymous users without auth - this creates inconsistent state
  return null;
}

export const current = query({
  args: {},
  handler: currentHandler,
});

// Internal version for system operations
export const internalCreateAnonymous = internalMutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

export const createAnonymous = mutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

/**
 * Increment user message statistics
 */
export const incrementMessage = mutation({
  args: {
    userId: v.id("users"),
    model: v.string(),
    provider: v.string(),
    tokensUsed: v.optional(v.number()),
    countTowardsMonthly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withRetry(
      async () => {
        const fresh = await ctx.db.get(args.userId);
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

        await ctx.db.patch(args.userId, updates);
      },
      5,
      25
    );
  },
});

export const graduateAnonymousUser = mutation({
  args: {
    anonymousUserId: v.id("users"),
    newUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { anonymousUserId, newUserId } = args;

    // If the anonymous user and new user are the same, no graduation needed
    // This happens when Convex Auth updates the anonymous user in-place
    if (anonymousUserId === newUserId) {
      return {
        success: true,
        conversationsTransferred: 0,
        messagesTransferred: 0,
      };
    }

    // Get both users
    const anonymousUser = await ctx.db.get(anonymousUserId);
    const newUser = await ctx.db.get(newUserId);

    // If anonymous user doesn't exist, it might have already been graduated
    // (e.g., in React StrictMode or due to a race condition)
    if (!anonymousUser) {
      console.warn(
        `Anonymous user ${anonymousUserId} not found - may have already been graduated`
      );
      return {
        success: true,
        conversationsTransferred: 0,
        messagesTransferred: 0,
      };
    }

    if (!newUser) {
      throw new Error("New user not found");
    }

    if (!anonymousUser.isAnonymous) {
      // User is not anonymous anymore - might have been graduated already
      console.warn(
        `User ${anonymousUserId} is not anonymous - may have already been graduated`
      );
      return {
        success: true,
        conversationsTransferred: 0,
        messagesTransferred: 0,
      };
    }

    try {
      // Transfer conversations from anonymous user to new user
      const anonymousConversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_recent", q => q.eq("userId", anonymousUserId))
        .collect();

      for (const conversation of anonymousConversations) {
        await ctx.db.patch(conversation._id, {
          userId: newUserId,
        });
      }

      // Update the new user with anonymous user's message counts
      const updatedMessagesSent =
        (newUser.messagesSent || 0) + (anonymousUser.messagesSent || 0);
      const updatedMonthlyMessagesSent =
        (newUser.monthlyMessagesSent || 0) +
        (anonymousUser.monthlyMessagesSent || 0);
      const updatedTotalMessageCount =
        (newUser.totalMessageCount || 0) +
        (anonymousUser.totalMessageCount || 0);
      const updatedConversationCount = Math.max(
        0,
        (newUser.conversationCount || 0) +
          (anonymousUser.conversationCount || 0)
      );

      await ctx.db.patch(newUserId, {
        messagesSent: Math.max(0, updatedMessagesSent),
        monthlyMessagesSent: Math.max(0, updatedMonthlyMessagesSent),
        totalMessageCount: Math.max(0, updatedTotalMessageCount),
        conversationCount: updatedConversationCount,
      });

      // Delete the anonymous user
      await ctx.db.delete(anonymousUserId);

      return {
        success: true,
        conversationsTransferred: anonymousConversations.length,
        messagesTransferred: anonymousUser.totalMessageCount || 0,
      };
    } catch (error) {
      console.error("Failed to graduate anonymous user:", error);
      throw new Error("Failed to graduate anonymous user");
    }
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export const patch = mutation({
  args: {
    id: v.id("users"),
    updates: v.any(),
  },
  handler: (ctx, args) => {
    const patch: Record<string, unknown> = { ...args.updates };
    return ctx.db.patch(args.id, patch);
  },
});

export const internalGetById = internalQuery({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export async function getMessageSentCountHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    return null;
  }
  return {
    messagesSent: user.messagesSent,
    monthlyMessagesSent: user.monthlyMessagesSent,
  };
}

export const getMessageSentCount = query({
  args: {},
  handler: getMessageSentCountHandler,
});

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

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

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
      await ctx.db.patch(userId, updates);
    }

    return { success: true };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    try {
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
          await ctx.db.delete(shared._id);
        }

        const summaries = await ctx.db
          .query("conversationSummaries")
          .withIndex("by_conversation_updated", q =>
            q.eq("conversationId", conversationId)
          )
          .collect();
        for (const summary of summaries) {
          await ctx.db.delete(summary._id);
        }

        const favorites = await ctx.db
          .query("messageFavorites")
          .withIndex("by_user_conversation", q =>
            q.eq("userId", userId).eq("conversationId", conversationId)
          )
          .collect();
        for (const favorite of favorites) {
          await ctx.db.delete(favorite._id);
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

        await ctx.db.delete(conversationId);
      }

      const remainingFavorites = await ctx.db
        .query("messageFavorites")
        .withIndex("by_user_created", q => q.eq("userId", userId))
        .collect();
      for (const favorite of remainingFavorites) {
        await ctx.db.delete(favorite._id);
      }

      const sharedByUser = await ctx.db
        .query("sharedConversations")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      for (const shared of sharedByUser) {
        await ctx.db.delete(shared._id);
      }

      const backgroundJobs = await ctx.db
        .query("backgroundJobs")
        .withIndex("by_user_id", q => q.eq("userId", userId))
        .collect();
      for (const job of backgroundJobs) {
        if (!job.jobId) {
          continue;
        }
        try {
          await ctx.runMutation(api.backgroundJobs.deleteJob, {
            jobId: job.jobId,
          });
        } catch (error) {
          console.warn(
            `Failed to delete background job ${job.jobId} during account deletion:`,
            error
          );
        }
      }

      const userSettingsDocs = await ctx.db
        .query("userSettings")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      for (const userSettingsDoc of userSettingsDocs) {
        await ctx.db.delete(userSettingsDoc._id);
      }

      const personaSettings = await ctx.db
        .query("userPersonaSettings")
        .withIndex("by_user_persona", q => q.eq("userId", userId))
        .collect();
      for (const personaSetting of personaSettings) {
        await ctx.db.delete(personaSetting._id);
      }

      const personas = await ctx.db
        .query("personas")
        .withIndex("by_user_active", q => q.eq("userId", userId))
        .collect();
      for (const persona of personas) {
        await ctx.db.delete(persona._id);
      }

      const userModels = await ctx.db
        .query("userModels")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      for (const model of userModels) {
        await ctx.db.delete(model._id);
      }

      const userImageModels = await ctx.db
        .query("userImageModels")
        .withIndex("by_user", q => q.eq("userId", userId))
        .collect();
      for (const model of userImageModels) {
        await ctx.db.delete(model._id);
      }

      const userApiKeys = await ctx.db
        .query("userApiKeys")
        .withIndex("by_user_provider", q => q.eq("userId", userId))
        .collect();
      for (const key of userApiKeys) {
        await ctx.db.delete(key._id);
      }

      const customAccounts = await ctx.db
        .query("accounts")
        .filter(q => q.eq(q.field("userId"), userId))
        .collect();
      for (const account of customAccounts) {
        await ctx.db.delete(account._id);
      }

      const customSessions = await ctx.db
        .query("sessions")
        .filter(q => q.eq(q.field("userId"), userId))
        .collect();
      for (const session of customSessions) {
        await ctx.db.delete(session._id);
      }

      const authAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", q => q.eq("userId", userId))
        .collect();
      for (const authAccount of authAccounts) {
        const verificationCodes = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", q => q.eq("accountId", authAccount._id))
          .collect();
        for (const code of verificationCodes) {
          await ctx.db.delete(code._id);
        }
        await ctx.db.delete(authAccount._id);
      }

      const authSessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", q => q.eq("userId", userId))
        .collect();
      for (const authSession of authSessions) {
        const refreshTokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", q => q.eq("sessionId", authSession._id))
          .collect();
        for (const refreshToken of refreshTokens) {
          await ctx.db.delete(refreshToken._id);
        }

        const verifiers = await ctx.db
          .query("authVerifiers")
          .filter(q => q.eq(q.field("sessionId"), authSession._id))
          .collect();
        for (const verifier of verifiers) {
          await ctx.db.delete(verifier._id);
        }

        await ctx.db.delete(authSession._id);
      }

      await ctx.db.delete(userId);

      return {
        success: true,
        deletedConversations: conversations.length,
      };
    } catch (error) {
      console.error("Failed to delete account:", error);
      throw new Error("Failed to delete account");
    }
  },
});
