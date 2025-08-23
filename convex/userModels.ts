import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

export const getRecentlyUsedModels = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = args.limit ?? 10;

    if (!userId) {
      // For anonymous users, just return built-in models
      return await ctx.db
        .query("builtInModels")
        .filter(q => q.eq(q.field("isActive"), true))
        .order("desc")
        .take(Math.min(limit, 5));
    }

    // Get recent assistant messages with model info from user's conversations
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_role")
      .filter(q => q.eq(q.field("role"), "assistant"))
      .filter(q =>
        q.and(
          q.neq(q.field("model"), undefined),
          q.neq(q.field("provider"), undefined)
        )
      )
      .order("desc")
      .take(limit * 3); // Get more to deduplicate

    // Filter to only include messages from user's conversations
    const userConversations = new Set();
    const userConversationsList = await ctx.db
      .query("conversations")
      .withIndex("by_user_recent", q => q.eq("userId", userId))
      .collect();

    for (const conv of userConversationsList) {
      userConversations.add(conv._id);
    }

    const userMessages = recentMessages.filter(msg =>
      userConversations.has(msg.conversationId)
    );

    // Deduplicate by model+provider combination while preserving order
    const seenModels = new Set<string>();
    const uniqueModels: Array<{
      modelId: string;
      provider: string;
      lastUsed: number;
    }> = [];

    for (const message of userMessages) {
      if (!(message.model && message.provider)) {
        continue;
      }

      const modelKey = `${message.provider}:${message.model}`;
      if (!seenModels.has(modelKey)) {
        seenModels.add(modelKey);
        uniqueModels.push({
          modelId: message.model,
          provider: message.provider,
          lastUsed: message.createdAt,
        });

        if (uniqueModels.length >= limit) {
          break;
        }
      }
    }

    // Get model details for each recent model
    const recentModelDetails: Array<{
      _id: Id<"userModels"> | Id<"builtInModels">;
      _creationTime: number;
      modelId: string;
      name: string;
      provider: string;
      contextLength: number;
      maxOutputTokens?: number;
      supportsImages: boolean;
      supportsTools: boolean;
      supportsReasoning: boolean;
      supportsFiles?: boolean;
      inputModalities?: string[];
      free?: boolean;
      selected?: boolean;
      lastUsed: number;
    }> = [];
    for (const recentModel of uniqueModels) {
      // First try to find user model
      let modelDetails: Doc<"userModels"> | Doc<"builtInModels"> | null =
        await ctx.db
          .query("userModels")
          .withIndex("by_user", q => q.eq("userId", userId))
          .filter(q =>
            q.and(
              q.eq(q.field("modelId"), recentModel.modelId),
              q.eq(q.field("provider"), recentModel.provider)
            )
          )
          .unique();

      // If not found, try built-in models
      if (!modelDetails) {
        modelDetails = await ctx.db
          .query("builtInModels")
          .filter(q =>
            q.and(
              q.eq(q.field("modelId"), recentModel.modelId),
              q.eq(q.field("provider"), recentModel.provider),
              q.eq(q.field("isActive"), true)
            )
          )
          .unique();
      }

      if (modelDetails) {
        recentModelDetails.push({
          _id: modelDetails._id,
          _creationTime: modelDetails._creationTime,
          modelId: modelDetails.modelId,
          name: modelDetails.name,
          provider: modelDetails.provider,
          contextLength: modelDetails.contextLength,
          maxOutputTokens: modelDetails.maxOutputTokens,
          supportsImages: modelDetails.supportsImages,
          supportsTools: modelDetails.supportsTools,
          supportsReasoning: modelDetails.supportsReasoning,
          supportsFiles: modelDetails.supportsFiles,
          inputModalities: modelDetails.inputModalities,
          free: "free" in modelDetails ? modelDetails.free : false,
          selected: "selected" in modelDetails ? modelDetails.selected : false,
          lastUsed: recentModel.lastUsed,
        });
      }
    }

    return recentModelDetails;
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
