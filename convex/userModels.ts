import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { userModelSchema } from "./lib/schemas";

export const getBuiltInModels = query({
  args: {},
  handler: async ctx => {
    if (!process.env.GEMINI_API_KEY) {
      return [];
    }

    return await ctx.db
      .query("builtInModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const checkModelConflict = query({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this model exists as a built-in model
    const builtInModel = await ctx.db
      .query("builtInModels")
      .filter(q =>
        q.and(
          q.eq(q.field("modelId"), args.modelId),
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("isActive"), true)
        )
      )
      .unique();

    return {
      hasConflict: Boolean(builtInModel),
      builtInModel: builtInModel || null,
    };
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

    // For authenticated users, check their models first
    if (userId) {
      const userModel = await ctx.db
        .query("userModels")
        .withIndex("by_user", q => q.eq("userId", userId))
        .filter(q =>
          q.and(
            q.eq(q.field("modelId"), args.modelId),
            q.eq(q.field("provider"), args.provider)
          )
        )
        .unique();

      if (userModel) {
        return userModel; // User's model takes precedence
      }
    }

    // Fallback to built-in models (for anonymous users or when user doesn't have the model)
    const builtInModel = await ctx.db
      .query("builtInModels")
      .filter(q =>
        q.and(
          q.eq(q.field("modelId"), args.modelId),
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("isActive"), true)
        )
      )
      .unique();

    return builtInModel;
  },
});

export const getAvailableModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    // Get built-in models (always available to everyone)
    const builtInModels = await ctx.db
      .query("builtInModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();

    if (!userId) {
      // For anonymous users, return only built-in models
      return builtInModels;
    }

    // For authenticated users, get their user models
    const userModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    // Create a set of user model modelId/provider combinations to filter out conflicts
    const userModelKeys = new Set(
      userModels.map(model => `${model.modelId}:${model.provider}`)
    );

    // Filter out built-in models that have been overridden by user models
    const availableBuiltInModels = builtInModels.filter(
      builtInModel =>
        !userModelKeys.has(`${builtInModel.modelId}:${builtInModel.provider}`)
    );

    // Return user models + non-conflicting built-in models
    return [...userModels, ...availableBuiltInModels];
  },
});

export const getUserSelectedModel = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      // For anonymous users, return the first built-in model
      return await ctx.db
        .query("builtInModels")
        .filter(q => q.eq(q.field("isActive"), true))
        .first();
    }

    // Check if user has a selected model
    const selectedModel = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("selected"), true))
      .unique();

    if (selectedModel) {
      return selectedModel;
    }

    // Check if user settings indicate default model should be selected
    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique();

    if (userSettings?.defaultModelSelected) {
      // Return the default built-in model
      return await ctx.db
        .query("builtInModels")
        .filter(q => q.eq(q.field("isActive"), true))
        .first();
    }

    // Check if user has any models at all
    const userHasModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (!userHasModels) {
      // Return the first built-in model if user has no models
      return await ctx.db
        .query("builtInModels")
        .filter(q => q.eq(q.field("isActive"), true))
        .first();
    }

    return null;
  },
});

export const hasUserModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    // Everyone has access to built-in models, so check if any exist
    const builtInModel = await ctx.db
      .query("builtInModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .first();

    if (builtInModel) {
      return true;
    }

    if (!userId) {
      return false; // Anonymous users only have built-in models
    }

    // Check if user has any personal models
    const userModels = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    return Boolean(userModels);
  },
});

export const toggleModel = mutation({
  args: {
    modelId: v.string(),
    modelData: v.optional(userModelSchema),
    acknowledgeConflict: v.optional(v.boolean()), // New parameter to confirm user understands the conflict
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, error: "User not authenticated" };
    }

    const existing = await ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("modelId"), args.modelId))
      .filter(q => q.eq(q.field("provider"), args.modelData?.provider))
      .unique();

    if (existing) {
      // Remove existing user model
      await ctx.db.delete(existing._id);
      return { success: true, action: "removed" };
    }

    if (!args.modelData) {
      return { success: false, error: "Model data required to add model" };
    }

    // Check if this conflicts with a built-in model
    const builtInModel = await ctx.db
      .query("builtInModels")
      .filter(q =>
        q.and(
          q.eq(q.field("modelId"), args.modelId),
          q.eq(q.field("provider"), args.modelData?.provider),
          q.eq(q.field("isActive"), true)
        )
      )
      .unique();

    if (builtInModel && !args.acknowledgeConflict) {
      return {
        success: false,
        requiresConfirmation: true,
        conflictingBuiltInModel: {
          name: builtInModel.name,
          modelId: builtInModel.modelId,
          provider: builtInModel.provider,
        },
        message: `This model (${builtInModel.name}) is already available as a free Polly model with usage limits. Adding your API key will remove limits but will use your credits instead of being free.`,
      };
    }

    // Add the user model
    await ctx.db.insert("userModels", {
      ...args.modelData,
      userId,
      selected: false,
      createdAt: Date.now(),
    });

    return {
      success: true,
      action: "added",
      overridesBuiltIn: Boolean(builtInModel),
    };
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

    // Check if this is a built-in model
    const builtInModel = await ctx.db
      .query("builtInModels")
      .filter(q =>
        q.and(
          q.eq(q.field("modelId"), args.modelId),
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("isActive"), true)
        )
      )
      .unique();

    const isDefaultModel = Boolean(builtInModel);

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
      .filter(q => q.eq(q.field("provider"), args.provider))
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
