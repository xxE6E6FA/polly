import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  hydrateModelsWithCapabilities,
  hydrateModelWithCapabilities,
} from "./lib/capability_resolver";
import { userModelInputSchema } from "./lib/schemas";

// ============================================================================
// EXPORTED HANDLERS FOR TESTING
// ============================================================================

export async function getBuiltInModelsHandler(ctx: QueryCtx, _args: {}) {
  if (!process.env.GEMINI_API_KEY) {
    return [];
  }

  const builtInModels = await ctx.db
    .query("builtInModels")
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();

  // Hydrate with dynamic capabilities from models.dev cache
  return await hydrateModelsWithCapabilities(ctx, builtInModels);
}

export async function checkModelConflictHandler(
  ctx: QueryCtx,
  args: { modelId: string; provider: string }
) {
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
}

export async function getUserModelsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return [];
  }

  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();

  // Hydrate with capabilities from models.dev cache
  const hydratedModels = await hydrateModelsWithCapabilities(ctx, userModels);

  // Add isAvailable flag (frontend will override after API check)
  return hydratedModels.map(model => ({
    ...model,
    isAvailable: true, // Default to available, let frontend override
  }));
}

export async function getModelByIDHandler(
  ctx: QueryCtx,
  args: { modelId: string; provider: string }
) {
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
      // Hydrate with dynamic capabilities from models.dev cache
      return await hydrateModelWithCapabilities(ctx, userModel);
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

  // Hydrate with dynamic capabilities from models.dev cache
  return builtInModel
    ? await hydrateModelWithCapabilities(ctx, builtInModel)
    : null;
}

export async function getUnavailableModelIdsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  // Get user models that have been checked and marked as unavailable
  // Models without isAvailable set (null/undefined) are considered available
  // by default - we only mark models as unavailable when we've explicitly
  // checked and found them to be unavailable
  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();

  const unavailableModels = userModels.filter(
    model => model.isAvailable === false
  );

  return unavailableModels.map(model => ({
    modelId: model.modelId,
    provider: model.provider,
  }));
}

export async function getAvailableModelsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  // Get built-in models (always available to everyone)
  const builtInModels = await ctx.db
    .query("builtInModels")
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();

  if (!userId) {
    // For anonymous users, return only built-in models
    // Hydrate with dynamic capabilities from models.dev cache
    return await hydrateModelsWithCapabilities(ctx, builtInModels);
  }

  // For authenticated users, get their user models (limit to 100 for performance)
  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .take(100);

  // Create a set of user model modelId/provider combinations to filter out conflicts
  const userModelKeys = new Set(
    userModels.map(model => `${model.modelId}:${model.provider}`)
  );

  // Filter out built-in models that have been overridden by user models
  const availableBuiltInModels = builtInModels.filter(
    builtInModel =>
      !userModelKeys.has(`${builtInModel.modelId}:${builtInModel.provider}`)
  );

  // Combine and hydrate all models with dynamic capabilities from models.dev cache
  const allModels = [...userModels, ...availableBuiltInModels];
  return await hydrateModelsWithCapabilities(ctx, allModels);
}

export async function getUserSelectedModelHandler(ctx: QueryCtx, _args: {}) {
  const userId = await getAuthUserId(ctx);

  // Fetch the default built-in model (used in multiple fallback cases)
  const getDefaultBuiltIn = () =>
    ctx.db
      .query("builtInModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .first();

  if (!userId) {
    // For anonymous users, return the first built-in model with hydrated capabilities
    const defaultModel = await getDefaultBuiltIn();
    return defaultModel
      ? await hydrateModelWithCapabilities(ctx, defaultModel)
      : null;
  }

  // Run independent queries in parallel for better performance
  const [selectedModel, userSettings, defaultBuiltIn] = await Promise.all([
    ctx.db
      .query("userModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("selected"), true))
      .unique(),
    ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique(),
    getDefaultBuiltIn(),
  ]);

  // Check if user has a selected model - hydrate with dynamic capabilities
  if (selectedModel) {
    return await hydrateModelWithCapabilities(ctx, selectedModel);
  }

  // Check if user settings indicate default model should be selected
  if (userSettings?.defaultModelSelected && defaultBuiltIn) {
    return await hydrateModelWithCapabilities(ctx, defaultBuiltIn);
  }

  // Check if user has any models at all
  const userHasModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .first();

  if (!userHasModels && defaultBuiltIn) {
    // Return the first built-in model if user has no models
    return await hydrateModelWithCapabilities(ctx, defaultBuiltIn);
  }

  return null;
}

export async function hasUserModelsHandler(ctx: QueryCtx, _args: {}) {
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
}

export async function toggleModelHandler(
  ctx: MutationCtx,
  args: {
    modelId: string;
    modelData?: {
      modelId: string;
      name: string;
      provider: string;
      // No capability fields - capabilities come from models.dev cache at query time
    };
    acknowledgeConflict?: boolean;
  }
) {
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
    await ctx.db.delete("userModels", existing._id);
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
}

export async function getRecentlyUsedModelsHandler(
  ctx: QueryCtx,
  args: { limit?: number }
) {
  const userId = await getAuthUserId(ctx);
  const limit = args.limit ?? 10;

  if (!userId) {
    // For anonymous users, return built-in models with hydrated capabilities
    const builtInModels = await ctx.db
      .query("builtInModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .order("desc")
      .take(Math.min(limit, 5));
    return await hydrateModelsWithCapabilities(ctx, builtInModels);
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

  // Get model details for each recent model and hydrate with dynamic capabilities
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
    supportsFiles: boolean;
    inputModalities: string[];
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
      // Hydrate with dynamic capabilities from models.dev cache
      const hydrated = await hydrateModelWithCapabilities(ctx, modelDetails);
      recentModelDetails.push({
        ...hydrated,
        free: "free" in modelDetails ? modelDetails.free : false,
        selected: "selected" in modelDetails ? modelDetails.selected : false,
        lastUsed: recentModel.lastUsed,
      });
    }
  }

  return recentModelDetails;
}

export async function selectModelHandler(
  ctx: MutationCtx,
  args: { modelId: string; provider: string }
) {
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
      operations.push(
        ctx.db.patch("userModels", selectedModel._id, { selected: false })
      );
    }

    operations.push(
      userSettings
        ? ctx.db.patch("userSettings", userSettings._id, {
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

  operations.push(ctx.db.patch("userModels", model._id, { selected: true }));

  if (selectedModel) {
    operations.push(
      ctx.db.patch("userModels", selectedModel._id, { selected: false })
    );
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
    await ctx.db.patch("userSettings", userSettings._id, {
      defaultModelSelected: false,
      updatedAt: Date.now(),
    });
  }

  return { success: true, modelId: args.modelId, isDefault: false };
}

export async function removeModelHandler(
  ctx: MutationCtx,
  args: { modelId: string; provider: string }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return { success: false, error: "User not authenticated" };
  }

  const existing = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q =>
      q.and(
        q.eq(q.field("modelId"), args.modelId),
        q.eq(q.field("provider"), args.provider)
      )
    )
    .unique();

  if (!existing) {
    return { success: false, error: "Model not found" };
  }

  await ctx.db.delete("userModels", existing._id);

  return {
    success: true,
    removedModel: {
      modelId: existing.modelId,
      provider: existing.provider,
      name: existing.name,
    },
  };
}

export async function updateModelAvailabilityHandler(
  ctx: MutationCtx,
  args: { availableModelIds: string[]; provider: string }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return { success: false, error: "User not authenticated" };
  }

  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();

  const availableModelIdsSet = new Set(args.availableModelIds);
  const checkedAt = Date.now();

  // Update availability for all user models of this provider
  const updates = userModels
    .filter(model => model.provider === args.provider)
    .map(async model => {
      const isAvailable = availableModelIdsSet.has(model.modelId);
      await ctx.db.patch("userModels", model._id, {
        isAvailable,
        availabilityCheckedAt: checkedAt,
      });
    });

  await Promise.all(updates);

  return { success: true };
}

export async function removeUnavailableModelsHandler(
  ctx: MutationCtx,
  _args: {}
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return { success: false, error: "User not authenticated" };
  }

  // Get user's models
  const userModels = await ctx.db
    .query("userModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();

  // Get available models from built-in models
  // Note: We can't call API actions from mutations either, so we use available data
  const builtInModels = await ctx.db
    .query("builtInModels")
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();

  // Create a set of available model IDs
  const availableModelIds = new Set(
    builtInModels.map((model: Doc<"builtInModels">) => model.modelId)
  );

  // Find unavailable models based on modelId
  const unavailableModels = userModels.filter(
    model => !availableModelIds.has(model.modelId)
  );

  // Remove unavailable models
  const removalPromises = unavailableModels.map(model =>
    ctx.db.delete("userModels", model._id)
  );

  await Promise.all(removalPromises);

  return {
    success: true,
    removedCount: unavailableModels.length,
    removedModels: unavailableModels.map(model => ({
      modelId: model.modelId,
      provider: model.provider,
      name: model.name,
    })),
  };
}

// ============================================================================
// CONVEX QUERY/MUTATION EXPORTS
// ============================================================================

export const getBuiltInModels = query({
  args: {},
  handler: getBuiltInModelsHandler,
});

export const checkModelConflict = query({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: checkModelConflictHandler,
});

export const getUserModels = query({
  args: {},
  handler: getUserModelsHandler,
});

export const getModelByID = query({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: getModelByIDHandler,
});

export const getUnavailableModelIds = query({
  args: {},
  handler: getUnavailableModelIdsHandler,
});

export const getAvailableModels = query({
  args: {},
  handler: getAvailableModelsHandler,
});

export const getUserSelectedModel = query({
  args: {},
  handler: getUserSelectedModelHandler,
});

export const hasUserModels = query({
  args: {},
  handler: hasUserModelsHandler,
});

export const toggleModel = mutation({
  args: {
    modelId: v.string(),
    modelData: v.optional(userModelInputSchema),
    acknowledgeConflict: v.optional(v.boolean()),
  },
  handler: toggleModelHandler,
});

export const getRecentlyUsedModels = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: getRecentlyUsedModelsHandler,
});

export const selectModel = mutation({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: selectModelHandler,
});

export const removeModel = mutation({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: removeModelHandler,
});

export const updateModelAvailability = mutation({
  args: {
    availableModelIds: v.array(v.string()),
    provider: v.string(),
  },
  handler: updateModelAvailabilityHandler,
});

export const removeUnavailableModels = mutation({
  args: {},
  handler: removeUnavailableModelsHandler,
});

// ============================================================================
// MODELS.DEV CATALOG QUERY
// ============================================================================

/**
 * Get all available models from models.dev cache for providers the user has API keys for.
 * This replaces the old fetchAllModels action that fetched directly from provider APIs.
 *
 * Returns models with capabilities pre-populated from models.dev (no hydration needed).
 */
export async function getAllProviderModelsHandler(
  ctx: QueryCtx,
  args: { providers: string[] }
) {
  if (args.providers.length === 0) {
    return [];
  }

  // Fetch all models from modelsDevCache for the specified providers
  const allModels = [];

  for (const provider of args.providers) {
    const providerModels = await ctx.db
      .query("modelsDevCache")
      .withIndex("by_provider_model", q => q.eq("provider", provider))
      .collect();

    allModels.push(...providerModels);
  }

  // Transform to FetchedModel format (capabilities already in cache)
  return allModels.map(model => ({
    modelId: model.modelId,
    name: model.name,
    provider: model.provider,
    contextWindow: model.contextWindow,
    supportsReasoning: model.supportsReasoning,
    supportsTools: model.supportsTools,
    supportsImages: model.inputModalities.includes("image"),
    supportsFiles:
      model.supportsAttachments ?? model.inputModalities.includes("file"),
    isAvailable: true, // Models in cache are available
  }));
}

export const getAllProviderModels = query({
  args: {
    providers: v.array(v.string()),
  },
  handler: getAllProviderModelsHandler,
});
