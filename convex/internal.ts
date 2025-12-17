import type { DataModel } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

/**
 * Generic function to clear all documents from a table
 */
async function clearTable<T extends keyof DataModel>(
  tableName: T,
  // biome-ignore lint/suspicious/noExplicitAny: Complex types for generic function
  ctx: { db: { query: any; delete: any } }
): Promise<number> {
  const docs = await ctx.db.query(tableName).collect();
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

export const clearUsers = mutation({
  args: {},
  handler: async ctx => clearTable("users", ctx),
});

export const clearAccounts = mutation({
  args: {},
  handler: async ctx => clearTable("accounts", ctx),
});

export const clearSessions = mutation({
  args: {},
  handler: async ctx => clearTable("sessions", ctx),
});

export const clearConversations = mutation({
  args: {},
  handler: async ctx => clearTable("conversations", ctx),
});

export const clearSharedConversations = mutation({
  args: {},
  handler: async ctx => clearTable("sharedConversations", ctx),
});

export const clearMessages = mutation({
  args: {},
  handler: async ctx => clearTable("messages", ctx),
});

export const clearUserApiKeys = mutation({
  args: {},
  handler: async ctx => clearTable("userApiKeys", ctx),
});

export const clearUserModels = mutation({
  args: {},
  handler: async ctx => clearTable("userModels", ctx),
});

export const clearBuiltInModels = mutation({
  args: {},
  handler: async ctx => clearTable("builtInModels", ctx),
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

        await ctx.db.patch("userModels", model._id, updates);
        updatedCount++;
      }
    }

    return { total: models.length, updated: updatedCount };
  },
});

export const clearUserPersonaSettings = mutation({
  args: {},
  handler: async ctx => clearTable("userPersonaSettings", ctx),
});

export const clearUserSettings = mutation({
  args: {},
  handler: async ctx => clearTable("userSettings", ctx),
});

export const cleanupOrphanedAccounts = mutation({
  args: {},
  handler: async ctx => {
    const accounts = await ctx.db.query("accounts").collect();
    let deletedCount = 0;

    for (const account of accounts) {
      const user = await ctx.db.get("users", account.userId);
      if (!user) {
        // User doesn't exist, delete the orphaned account
        await ctx.db.delete("accounts", account._id);
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
  handler: async ctx => clearTable("authAccounts", ctx),
});

export const clearAuthSessions = mutation({
  args: {},
  handler: async ctx => clearTable("authSessions", ctx),
});

export const clearAuthVerificationCodes = mutation({
  args: {},
  handler: async ctx => clearTable("authVerificationCodes", ctx),
});

export const clearAuthRefreshTokens = mutation({
  args: {},
  handler: async ctx => clearTable("authRefreshTokens", ctx),
});

export const clearAuthRateLimits = mutation({
  args: {},
  handler: async ctx => clearTable("authRateLimits", ctx),
});
