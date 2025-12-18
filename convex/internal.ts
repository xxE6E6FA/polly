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

// Migration to strip capability fields from models - capabilities now come from models.dev cache
export const stripCapabilityFieldsFromModels = mutation({
  args: {},
  handler: async ctx => {
    let builtInUpdated = 0;
    let userModelsUpdated = 0;

    // Strip capability fields from builtInModels
    const builtInModels = await ctx.db.query("builtInModels").collect();
    for (const model of builtInModels) {
      // Only keep schema-allowed fields
      await ctx.db.replace("builtInModels", model._id, {
        modelId: model.modelId,
        name: model.name,
        provider: model.provider,
        createdAt: model.createdAt,
        free: model.free,
        isActive: model.isActive,
        displayProvider: model.displayProvider,
      });
      builtInUpdated++;
    }

    // Strip capability fields from userModels
    const userModels = await ctx.db.query("userModels").collect();
    for (const model of userModels) {
      // Only keep schema-allowed fields
      await ctx.db.replace("userModels", model._id, {
        modelId: model.modelId,
        name: model.name,
        provider: model.provider,
        createdAt: model.createdAt,
        userId: model.userId,
        selected: model.selected,
        free: model.free,
        isAvailable: model.isAvailable,
        availabilityCheckedAt: model.availabilityCheckedAt,
      });
      userModelsUpdated++;
    }

    return { builtInUpdated, userModelsUpdated };
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
