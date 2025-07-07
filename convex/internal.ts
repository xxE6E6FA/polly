import { mutation } from "./_generated/server";

export const clearUsers = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("users").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearAccounts = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("accounts").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearSessions = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("sessions").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearConversations = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("conversations").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearSharedConversations = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("sharedConversations").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearMessages = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("messages").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearUserApiKeys = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("userApiKeys").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearUserModels = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("userModels").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const migrateUserModelsCapabilities = mutation({
  args: {},
  handler: async ctx => {
    const models = await ctx.db.query("userModels").collect();
    let updatedCount = 0;

    for (const model of models) {
      // Check if model is missing the supportsFiles capability field
      if (model.supportsFiles === undefined) {
        const contextWindow = model.contextLength;

        // Conservative default: assume file support for most modern models
        const supportsFiles =
          contextWindow >= 32000 ||
          model.provider === "anthropic" ||
          model.provider === "openrouter";

        const updates: Record<string, boolean> = {
          supportsFiles,
        };

        await ctx.db.patch(model._id, updates);
        updatedCount++;
      }
    }

    return { total: models.length, updated: updatedCount };
  },
});

export const clearUserPersonaSettings = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("userPersonaSettings").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const clearUserSettings = mutation({
  args: {},
  handler: async ctx => {
    const docs = await ctx.db.query("userSettings").collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});

export const cleanupOrphanedAccounts = mutation({
  args: {},
  handler: async ctx => {
    const accounts = await ctx.db.query("accounts").collect();
    let deletedCount = 0;

    for (const account of accounts) {
      const user = await ctx.db.get(account.userId);
      if (!user) {
        // User doesn't exist, delete the orphaned account
        await ctx.db.delete(account._id);
        deletedCount++;
        console.warn(
          `Deleted orphaned account ${account._id} for non-existent user ${account.userId}`
        );
      }
    }

    return {
      deletedCount,
      message: `Cleaned up ${deletedCount} orphaned accounts`,
    };
  },
});

// Clear auth-related tables (with correct table names)
export const clearAuthAccounts = mutation({
  args: {},
  handler: async ctx => {
    const documents = await ctx.db.query("authAccounts").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return documents.length;
  },
});

export const clearAuthSessions = mutation({
  args: {},
  handler: async ctx => {
    const documents = await ctx.db.query("authSessions").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return documents.length;
  },
});

export const clearAuthVerificationCodes = mutation({
  args: {},
  handler: async ctx => {
    const documents = await ctx.db.query("authVerificationCodes").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return documents.length;
  },
});

export const clearAuthRefreshTokens = mutation({
  args: {},
  handler: async ctx => {
    const documents = await ctx.db.query("authRefreshTokens").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return documents.length;
  },
});

export const clearAuthRateLimits = mutation({
  args: {},
  handler: async ctx => {
    const documents = await ctx.db.query("authRateLimits").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return documents.length;
  },
});
