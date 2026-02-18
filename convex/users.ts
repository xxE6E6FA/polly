import { v } from "convex/values";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "../shared/constants";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { verifyAnonymousToken } from "./lib/anonymous_auth";

// Re-export handler functions for tests
export {
  currentHandler,
  getMessageSentCountHandler,
  handleGetUserById,
} from "./lib/user/query_handlers";

import { getAuthUserId } from "./lib/auth";
import { createDefaultConversationFields } from "./lib/shared_utils";
import {
  deleteAccountHandler,
  incrementMessageHandler,
  internalDeleteUserDataHandler,
  internalPatchHandler,
  updateProfileHandler,
} from "./lib/user/mutation_handlers";
import {
  currentHandler,
  getMessageSentCountHandler,
  handleGetUserById,
} from "./lib/user/query_handlers";

export const current = query({
  args: {},
  handler: currentHandler,
});

export const incrementMessage = internalMutation({
  args: {
    userId: v.id("users"),
    model: v.string(),
    provider: v.string(),
    tokensUsed: v.optional(v.number()),
    countTowardsMonthly: v.optional(v.boolean()),
  },
  handler: incrementMessageHandler,
});

export const getById = query({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

/**
 * Internal mutation for system operations only.
 * This is NOT exposed to clients - use updateProfile for user-facing updates.
 */
export const internalPatch = internalMutation({
  args: {
    id: v.id("users"),
    updates: v.any(),
  },
  handler: internalPatchHandler,
});

/**
 * Cascade-delete all user data. Used by Clerk user.deleted webhook.
 */
export const internalDeleteUserData = internalMutation({
  args: { userId: v.id("users") },
  handler: internalDeleteUserDataHandler,
});

export const internalGetById = internalQuery({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export const internalGetByExternalId = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", q => q.eq("externalId", args.externalId))
      .unique();
    return user?._id ?? null;
  },
});

/**
 * Check whether an externalId belongs to an existing anonymous user.
 * Used by the anonymous auth refresh endpoint to prevent token minting
 * for non-anonymous (Clerk) users.
 */
export const internalIsAnonymousUser = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", q => q.eq("externalId", args.externalId))
      .unique();
    return user?.isAnonymous === true;
  },
});

export const getMessageSentCount = query({
  args: {},
  handler: getMessageSentCountHandler,
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: updateProfileHandler,
});

export const deleteAccount = mutation({
  args: {},
  handler: deleteAccountHandler,
});

/**
 * Just-in-time user creation for Clerk-authenticated users.
 *
 * Called by the frontend after Clerk sign-in succeeds. Creates the user
 * document if it doesn't already exist (race-safe with the webhook).
 * Returns the user document.
 */
export const ensureUser = mutation({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const externalId = identity.subject;

    // Only Clerk-authenticated users can call ensureUser. Reject anonymous
    // users to prevent them from self-promoting to bypass message limits.
    if (externalId.startsWith("anon_")) {
      throw new Error("Anonymous users cannot call ensureUser");
    }

    // Check if user already exists by Clerk ID (webhook may have created it)
    const existingByExternalId = await ctx.db
      .query("users")
      .withIndex("byExternalId", q => q.eq("externalId", externalId))
      .unique();

    if (existingByExternalId) {
      return existingByExternalId;
    }

    // Check for existing user by email (migrating from old auth system).
    // If found, link the existing user to the new Clerk identity.
    const email = identity.email;
    if (email) {
      // Use .first() — email is not a unique constraint, duplicates are possible
      // (e.g. old auth migration). .unique() would throw on duplicates.
      const existingByEmail = await ctx.db
        .query("users")
        .withIndex("email", q => q.eq("email", email))
        .first();

      if (existingByEmail) {
        // Only merge if the existing user has no Clerk identity yet.
        // This prevents an attacker with a matching email from hijacking
        // an account that is already linked to a different Clerk user.
        if (!existingByEmail.externalId) {
          await ctx.db.patch(existingByEmail._id, {
            externalId,
            name: identity.name ?? existingByEmail.name,
            image: identity.pictureUrl ?? existingByEmail.image,
            isAnonymous: false,
          });
          return await ctx.db.get(existingByEmail._id);
        }
        // Existing user already has a different identity — don't merge,
        // fall through to create a new user.
      }
    }

    // No existing user found — create a new one
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      externalId,
      name: identity.name ?? undefined,
      email: email ?? undefined,
      image: identity.pictureUrl ?? undefined,
      isAnonymous: false,
      createdAt: now,
      messagesSent: 0,
      monthlyMessagesSent: 0,
      monthlyLimit: MONTHLY_MESSAGE_LIMIT,
      lastMonthlyReset: now,
      conversationCount: 0,
      totalMessageCount: 0,
    });

    // Create default user settings
    await ctx.db.insert("userSettings", {
      userId,
      personasEnabled: true,
      openRouterSorting: "default",
      autoArchiveEnabled: false,
      autoArchiveDays: 30,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(userId);
  },
});

/**
 * Create an anonymous user record for custom JWT auth.
 * Called by the /auth/anonymous HTTP endpoint.
 */
export const createAnonymousUser = internalMutation({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      externalId,
      isAnonymous: true,
      name: "Guest",
      messagesSent: 0,
      monthlyMessagesSent: 0,
      monthlyLimit: ANONYMOUS_MESSAGE_LIMIT,
      lastMonthlyReset: now,
      createdAt: now,
      conversationCount: 0,
      totalMessageCount: 0,
    });
  },
});

/**
 * Internal mutation: transfer anonymous user data to an authenticated user.
 * Must only be called after verifying ownership of the anonymous session.
 */
export const internalGraduateAnonymousUser = internalMutation({
  args: {
    anonymousExternalId: v.string(),
    callerExternalId: v.string(),
  },
  handler: async (ctx, { anonymousExternalId, callerExternalId }) => {
    // Resolve caller by their Clerk externalId
    const callerUser = await ctx.db
      .query("users")
      .withIndex("byExternalId", q => q.eq("externalId", callerExternalId))
      .unique();
    if (!callerUser) {
      throw new Error("Caller user not found");
    }

    // Look up the anonymous user by externalId
    const anonUser = await ctx.db
      .query("users")
      .withIndex("byExternalId", q => q.eq("externalId", anonymousExternalId))
      .unique();

    if (!anonUser?.isAnonymous) {
      return { conversationsTransferred: 0, messagesTransferred: 0 };
    }

    const anonymousUserId = anonUser._id;

    // Transfer conversations
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", anonymousUserId))
      .collect();

    for (const conv of conversations) {
      await ctx.db.patch(conv._id, { userId: callerUser._id });
    }

    // Transfer messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", anonymousUserId))
      .collect();

    for (const msg of messages) {
      await ctx.db.patch(msg._id, { userId: callerUser._id });
    }

    // Transfer user files
    const userFiles = await ctx.db
      .query("userFiles")
      .withIndex("by_user_created", q => q.eq("userId", anonymousUserId))
      .collect();

    for (const file of userFiles) {
      await ctx.db.patch(file._id, { userId: callerUser._id });
    }

    // Merge message counters
    await ctx.db.patch(callerUser._id, {
      messagesSent:
        (callerUser.messagesSent || 0) + (anonUser.messagesSent || 0),
      monthlyMessagesSent:
        (callerUser.monthlyMessagesSent || 0) +
        (anonUser.monthlyMessagesSent || 0),
      totalMessageCount:
        (callerUser.totalMessageCount || 0) + (anonUser.totalMessageCount || 0),
      conversationCount:
        (callerUser.conversationCount || 0) + conversations.length,
    });

    // Clean up orphaned anonymous user data (settings, memories)
    const anonSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", anonymousUserId))
      .collect();
    for (const s of anonSettings) {
      await ctx.db.delete(s._id);
    }

    const anonMemories = await ctx.db
      .query("userMemories")
      .withIndex("by_user", q => q.eq("userId", anonymousUserId))
      .collect();
    for (const m of anonMemories) {
      await ctx.db.delete(m._id);
    }

    // Delete the anonymous user
    await ctx.db.delete(anonymousUserId);

    return {
      conversationsTransferred: conversations.length,
      messagesTransferred: messages.length,
    };
  },
});

/**
 * Graduate an anonymous user's data to the authenticated caller.
 *
 * Verifies the provided anonymous JWT server-side to prove the caller
 * actually owned the anonymous session, then transfers all conversations
 * and messages to the caller's account.
 */
export const graduateAnonymousUser = action({
  args: {
    anonymousToken: v.string(),
  },
  handler: async (
    ctx,
    { anonymousToken }
  ): Promise<{
    conversationsTransferred: number;
    messagesTransferred: number;
  }> => {
    const callerIdentity = await ctx.auth.getUserIdentity();
    if (!callerIdentity) {
      throw new Error("Not authenticated");
    }

    const publicKeyPem = process.env.ANON_AUTH_PUBLIC_KEY;
    const issuer = process.env.ANON_AUTH_ISSUER;
    if (!(publicKeyPem && issuer)) {
      throw new Error("Anonymous auth not configured");
    }

    // Verify the anonymous JWT to extract the externalId
    const anonymousExternalId = await verifyAnonymousToken(
      anonymousToken,
      publicKeyPem,
      issuer
    );
    if (!anonymousExternalId) {
      throw new Error("Invalid or expired anonymous token");
    }

    return ctx.runMutation(internal.users.internalGraduateAnonymousUser, {
      anonymousExternalId,
      callerExternalId: callerIdentity.subject,
    });
  },
});

/**
 * Import guest conversations from localStorage after sign-up.
 * Creates conversation + message documents for the authenticated user.
 */
export const importGuestConversations = mutation({
  args: {
    conversations: v.array(
      v.object({
        title: v.string(),
        messages: v.array(
          v.object({
            role: v.union(v.literal("user"), v.literal("assistant")),
            content: v.string(),
            createdAt: v.number(),
            model: v.optional(v.string()),
            provider: v.optional(v.string()),
            reasoning: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Reject anonymous users — import is for Clerk-authenticated users only
    if (identity.subject.startsWith("anon_")) {
      throw new Error("Anonymous users cannot import conversations");
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Input bounds to prevent abuse
    const MAX_CONVERSATIONS = 50;
    const MAX_MESSAGES_PER_CONVERSATION = 200;
    const MAX_CONTENT_LENGTH = 100_000;

    if (args.conversations.length > MAX_CONVERSATIONS) {
      throw new Error(`Too many conversations (max ${MAX_CONVERSATIONS})`);
    }

    const importedIds: string[] = [];

    for (const conv of args.conversations) {
      if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        throw new Error(
          `Too many messages in conversation (max ${MAX_MESSAGES_PER_CONVERSATION})`
        );
      }

      for (const msg of conv.messages) {
        if (msg.content.length > MAX_CONTENT_LENGTH) {
          throw new Error(
            `Message content too long (max ${MAX_CONTENT_LENGTH})`
          );
        }
      }

      const fields = createDefaultConversationFields(userId, {
        title: conv.title.slice(0, 500),
      });

      const conversationId = await ctx.db.insert("conversations", fields);

      for (const msg of conv.messages) {
        await ctx.db.insert("messages", {
          conversationId,
          userId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          model: msg.model,
          provider: msg.provider,
          reasoning: msg.reasoning,
          isMainBranch: true,
          status: "done",
        });
      }

      importedIds.push(conversationId);
    }

    return { importedCount: importedIds.length };
  },
});
