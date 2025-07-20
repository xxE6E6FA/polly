import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

export const getVirtualPollyModel = query({
  args: {},
  handler: () => {
    if (!process.env.GEMINI_API_KEY) {
      return null;
    }
    return createVirtualPollyModel();
  },
});

export const getUserModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    return ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

export const getModelByID = query({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return null;
    }

    const model = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("modelId"), args.modelId))
      .filter(q =>
        q.or(
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("displayProvider"), args.provider)
        )
      )
      .unique();

    return model;
  },
});

export const getAvailableModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    const pollyModel = getPollyModel();

    if (!userId) {
      return [pollyModel];
    }

    const databaseModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    return [pollyModel, ...databaseModels];
  },
});

export const getUserSelectedModel = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return getPollyModel();
    }

    const selectedModel = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("selected"), true))
      .unique();

    if (selectedModel) {
      return selectedModel;
    }

    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique();

    if (userSettings?.defaultModelSelected) {
      return getPollyModel();
    }

    const userHasModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (!userHasModels) {
      return getPollyModel();
    }

    return null;
  },
});

export const hasUserModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

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
        free: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return;
    }

    const existing = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("modelId"), args.modelId))
      .filter(q =>
        q.or(
          q.eq(q.field("provider"), args.modelData?.provider),
          q.eq(q.field("displayProvider"), args.modelData?.provider)
        )
      )
      .unique();

    if (!existing && args.modelData) {
      // Determine displayProvider based on whether this is a free model
      const displayProvider = args.modelData?.free
        ? "polly"
        : args.modelData?.provider;

      await ctx.db.insert("userModels", {
        ...args.modelData,
        displayProvider,
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
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return;
    }

    if (!args.modelId || args.modelId.trim() === "") {
      return;
    }

    const selectedModel = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("selected"), true))
      .unique();

    const defaultModel = getPollyModel();
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
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("modelId"), args.modelId))
      .filter(q =>
        q.or(
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("displayProvider"), args.provider)
        )
      )
      .unique();

    if (!model) {
      return;
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

function getPollyModel() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  return createVirtualPollyModel();
}

function createVirtualPollyModel() {
  return {
    _id: "polly-gemini-default" as Id<"userModels">,
    _creationTime: Date.now(),
    userId: "anonymous" as Id<"users">,
    modelId: "gemini-2.5-flash-lite-preview-06-17",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    displayProvider: "polly",
    contextLength: 1048576,
    maxOutputTokens: undefined,
    supportsImages: true,
    supportsTools: true,
    supportsReasoning: true,
    free: true,
    createdAt: Date.now(),
  };
}
