import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId, requireAuth } from "./lib/auth";
import { CACHE_TTL, cacheKeys, withCache } from "./lib/cache_utils";

export const getUserModels = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

export const getUserModelsCached = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || (await getCurrentUserId(ctx));

    if (!userId) {
      return [];
    }

    return await withCache(
      cacheKeys.userModels(userId),
      async () => {
        return await ctx.db
          .query("userModels")
          .withIndex("by_user", q => q.eq("userId", userId))
          .collect();
      },
      CACHE_TTL
    );
  },
});

export const getUserSelectedModel = query({
  args: {},
  handler: async ctx => {
    const userId = await getCurrentUserId(ctx);

    if (!userId) {
      return getAnonymousDefaultModel();
    }

    const selectedModel = await ctx.db
      .query("userModels")
      .withIndex("by_user_selected", q =>
        q.eq("userId", userId).eq("selected", true)
      )
      .unique();

    if (selectedModel) {
      return selectedModel;
    }

    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique();

    if (userSettings?.defaultModelSelected) {
      return getAnonymousDefaultModel();
    }

    const userHasModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (!userHasModels) {
      return getAnonymousDefaultModel();
    }

    return null;
  },
});

export const getUserModelsByProvider = query({
  args: {},
  handler: async ctx => {
    const userId = await getCurrentUserId(ctx);

    if (!userId) {
      const defaultModel = getAnonymousDefaultModel();
      if (!defaultModel) {
        return [];
      }

      return [
        {
          id: "polly",
          name: "Polly",
          models: [defaultModel],
        },
      ];
    }

    const models = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const defaultModel = getAnonymousDefaultModel();
    const providers = [];

    if (defaultModel) {
      providers.push({
        id: "polly",
        name: "Polly",
        models: [defaultModel],
      });
    }

    if (models.length > 0) {
      const byProvider = models.reduce(
        (acc, model) => {
          acc[model.provider] = acc[model.provider] || [];
          acc[model.provider].push(model);
          return acc;
        },
        {} as Record<string, typeof models>
      );

      const userProviders = Object.entries(byProvider).map(
        ([providerName, providerModels]) => ({
          id: providerName,
          name: providerName,
          models: providerModels,
        })
      );

      providers.push(...userProviders);
    }

    return providers;
  },
});

export const hasUserModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getCurrentUserId(ctx);

    if (!userId) {
      return Boolean(process.env.GEMINI_API_KEY);
    }

    const count = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    if (count.length > 0) {
      return true;
    }

    return Boolean(process.env.GEMINI_API_KEY);
  },
});

export const toggleModel = mutation({
  args: {
    modelId: v.string(),
    modelData: v.optional(
      v.object({
        modelId: v.string(),
        name: v.string(),
        provider: v.string(),
        contextLength: v.number(),
        maxOutputTokens: v.optional(v.number()),
        supportsImages: v.boolean(),
        supportsTools: v.boolean(),
        supportsReasoning: v.boolean(),
        supportsFiles: v.optional(v.boolean()),
        inputModalities: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const existing = await ctx.db
      .query("userModels")
      .withIndex("by_user_model_id", q =>
        q.eq("userId", userId).eq("modelId", args.modelId)
      )
      .unique();

    if (!existing && args.modelData) {
      await ctx.db.insert("userModels", {
        ...args.modelData,
        userId,
        selected: false,
        createdAt: Date.now(),
      });
    } else if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const selectModel = mutation({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (!args.modelId || args.modelId.trim() === "") {
      throw new Error("Model ID is required");
    }

    const selectedModel = await ctx.db
      .query("userModels")
      .withIndex("by_user_selected", q =>
        q.eq("userId", userId).eq("selected", true)
      )
      .unique();

    const defaultModel = getAnonymousDefaultModel();
    const isDefaultModel =
      defaultModel && args.modelId === defaultModel.modelId;

    if (isDefaultModel) {
      const userSettings = await ctx.db
        .query("userSettings")
        .withIndex("by_user", q => q.eq("userId", userId))
        .unique();

      const operations = [];

      if (selectedModel) {
        operations.push(ctx.db.patch(selectedModel._id, { selected: false }));
      }

      operations.push(
        userSettings
          ? ctx.db.patch(userSettings._id, {
              defaultModelSelected: true,
              updatedAt: Date.now(),
            })
          : ctx.db.insert("userSettings", {
              userId,
              defaultModelSelected: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
      );

      await Promise.all(operations);
      return { success: true, modelId: args.modelId, isDefault: true };
    }

    const model = await ctx.db
      .query("userModels")
      .withIndex("by_user_model_id", q =>
        q.eq("userId", userId).eq("modelId", args.modelId)
      )
      .unique();

    if (!model) {
      throw new Error(
        `Model '${args.modelId}' not found in user's configured models. Please add the model in Settings first.`
      );
    }

    if (model.modelId === selectedModel?.modelId) {
      return {
        success: true,
        modelId: args.modelId,
        isDefault: false,
        alreadySelected: true,
      };
    }

    const operations = [];

    operations.push(ctx.db.patch(model._id, { selected: true }));

    if (selectedModel) {
      operations.push(ctx.db.patch(selectedModel._id, { selected: false }));
    }

    const userSettingsPromise = ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique();

    const [, , userSettings] = await Promise.all([
      ...operations,
      userSettingsPromise,
    ]);

    if (userSettings?.defaultModelSelected) {
      await ctx.db.patch(userSettings._id, {
        defaultModelSelected: false,
        updatedAt: Date.now(),
      });
    }

    return { success: true, modelId: args.modelId, isDefault: false };
  },
});

// Helper function to get default anonymous model

function getAnonymousDefaultModel() {
  // Only provide default model if we have the Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  return {
    _id: "anonymous-gemini-default" as Id<"userModels">,
    _creationTime: Date.now(),
    userId: "anonymous" as Id<"users">,
    modelId: "gemini-2.5-flash-lite-preview-06-17",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    contextLength: 1048576,
    maxOutputTokens: undefined,
    supportsImages: true,
    supportsTools: true,
    supportsReasoning: true,
    isPollyProvided: true,
    free: true,
    createdAt: Date.now(),
  };
}
