import { getAuthUserId } from "../auth";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getAuthenticatedUser } from "../shared_utils";

// =====================================================================
// QUERY HANDLERS
// =====================================================================

export async function getUserImageModelsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return [];
  }

  return ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
}

export async function getUserImageModelsInternalHandler(
  ctx: QueryCtx,
  args: { userId: Id<"users"> }
) {
  return ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", args.userId))
    .collect();
}

export async function getBuiltInImageModelsHandler(ctx: QueryCtx) {
  return await ctx.db
    .query("builtInImageModels")
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();
}

export async function getBuiltInImageModelByModelIdHandler(
  ctx: QueryCtx,
  args: { modelId: string }
) {
  return await ctx.db
    .query("builtInImageModels")
    .filter(q =>
      q.and(
        q.eq(q.field("modelId"), args.modelId),
        q.eq(q.field("isActive"), true)
      )
    )
    .first();
}

export async function getAvailableImageModelsHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  // Get built-in image models
  const builtInModels = await ctx.db
    .query("builtInImageModels")
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();

  if (!userId) {
    // For anonymous users, return only built-in models
    return builtInModels.map(model => ({
      ...model,
      isBuiltIn: true as const,
    }));
  }

  // Get user's image models
  const userModels = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();

  // Create a set of user model keys to filter out conflicts
  const userModelKeys = new Set(
    userModels.map(model => `${model.modelId}:${model.provider}`)
  );

  // Filter out built-in models that have been overridden by user models
  const availableBuiltInModels = builtInModels
    .filter(
      builtInModel =>
        !userModelKeys.has(`${builtInModel.modelId}:${builtInModel.provider}`)
    )
    .map(model => ({
      ...model,
      isBuiltIn: true as const,
    }));

  const userModelsWithFlag = userModels.map(model => ({
    ...model,
    isBuiltIn: false as const,
  }));

  return [...userModelsWithFlag, ...availableBuiltInModels];
}

export async function getSelectedImageModelWithFallbackHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  // Default built-in image model fallback
  const getDefaultBuiltIn = () =>
    ctx.db
      .query("builtInImageModels")
      .filter(q => q.eq(q.field("isActive"), true))
      .first();

  if (!userId) {
    return await getDefaultBuiltIn();
  }

  // Check for user's selected image model
  const selectedModel = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q => q.eq(q.field("selected"), true))
    .first();

  if (selectedModel) {
    return selectedModel;
  }

  // Check if user has any image models
  const userHasModels = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .first();

  if (!userHasModels) {
    // Return first built-in model if user has no models
    return await getDefaultBuiltIn();
  }

  return null;
}

export async function getModelDefinitionHandler(
  ctx: QueryCtx,
  args: { modelId: string }
) {
  return await ctx.db
    .query("imageModelDefinitions")
    .withIndex("by_model_id", q => q.eq("modelId", args.modelId))
    .first();
}

export async function getModelDefinitionsHandler(
  ctx: QueryCtx,
  args: { modelIds: string[] }
) {
  if (args.modelIds.length === 0) {
    return [];
  }

  const definitions = await Promise.all(
    args.modelIds.map(modelId =>
      ctx.db
        .query("imageModelDefinitions")
        .withIndex("by_model_id", q => q.eq("modelId", modelId))
        .first()
    )
  );

  return definitions.filter(def => def !== null);
}

export async function getUserSelectedImageModelHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return null;
  }

  const selectedModel = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q => q.eq(q.field("selected"), true))
    .unique();

  return selectedModel;
}

// =====================================================================
// MUTATION HANDLERS
// =====================================================================

export async function updateUserModelCapabilitiesHandler(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    modelId: string;
    supportedAspectRatios: string[];
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
    modelVersion: string;
  }
) {
  const existingModel = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", args.userId))
    .filter(q => q.eq(q.field("modelId"), args.modelId))
    .first();

  if (existingModel) {
    await ctx.db.patch("userImageModels", existingModel._id, {
      supportedAspectRatios: args.supportedAspectRatios,
      supportsMultipleImages: args.supportsMultipleImages,
      supportsNegativePrompt: args.supportsNegativePrompt,
      modelVersion: args.modelVersion,
    });
  }
}

export async function storeModelDefinitionHandler(
  ctx: MutationCtx,
  modelDefinition: {
    modelId: string;
    name: string;
    provider: string;
    description: string;
    modelVersion: string;
    owner: string;
    tags: string[];
    supportedAspectRatios: string[];
    supportsUpscaling: boolean;
    supportsInpainting: boolean;
    supportsOutpainting: boolean;
    supportsImageToImage: boolean;
    supportsMultipleImages: boolean;
    supportsNegativePrompt?: boolean;
    coverImageUrl?: string;
    exampleImages?: string[];
    createdAt?: number;
    lastUpdated?: number;
  }
) {
  // Check if definition already exists
  const existing = await ctx.db
    .query("imageModelDefinitions")
    .withIndex("by_model_id", q => q.eq("modelId", modelDefinition.modelId))
    .first();

  if (existing) {
    // Update existing definition
    await ctx.db.patch("imageModelDefinitions", existing._id, {
      ...modelDefinition,
      lastUpdated: Date.now(),
    });
    return existing._id;
  }

  // Create new definition
  return await ctx.db.insert("imageModelDefinitions", {
    ...modelDefinition,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  });
}

export async function toggleImageModelHandler(
  ctx: MutationCtx,
  args: {
    modelId: string;
    provider: string;
    name: string;
    description?: string;
    modelVersion?: string;
    owner?: string;
    tags?: string[];
    supportedAspectRatios?: string[];
    supportsUpscaling?: boolean;
    supportsInpainting?: boolean;
    supportsOutpainting?: boolean;
    supportsImageToImage?: boolean;
    supportsMultipleImages?: boolean;
    supportsNegativePrompt?: boolean;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  // Check if model already exists
  const existingModel = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q =>
      q.and(
        q.eq(q.field("modelId"), args.modelId),
        q.eq(q.field("provider"), args.provider)
      )
    )
    .unique();

  if (existingModel) {
    // Remove if exists
    await ctx.db.delete("userImageModels", existingModel._id);
    return { action: "removed", model: existingModel };
  }

  // Add if doesn't exist
  const newModel = await ctx.db.insert("userImageModels", {
    userId,
    modelId: args.modelId,
    name: args.name,
    provider: args.provider,
    description: args.description,
    modelVersion: args.modelVersion,
    owner: args.owner,
    tags: args.tags,
    supportedAspectRatios: args.supportedAspectRatios,
    supportsUpscaling: args.supportsUpscaling,
    supportsInpainting: args.supportsInpainting,
    supportsOutpainting: args.supportsOutpainting,
    supportsImageToImage: args.supportsImageToImage,
    supportsMultipleImages: args.supportsMultipleImages,
    supportsNegativePrompt: args.supportsNegativePrompt,
    createdAt: Date.now(),
  });

  const inserted = await ctx.db.get("userImageModels", newModel);
  return { action: "added", model: inserted };
}

export async function setSelectedImageModelHandler(
  ctx: MutationCtx,
  args: {
    modelId: string;
    provider: string;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  // Clear previous selection
  const selectedModels = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q => q.eq(q.field("selected"), true))
    .collect();

  for (const model of selectedModels) {
    await ctx.db.patch("userImageModels", model._id, { selected: false });
  }

  // Set new selection
  const targetModel = await ctx.db
    .query("userImageModels")
    .withIndex("by_user", q => q.eq("userId", userId))
    .filter(q =>
      q.and(
        q.eq(q.field("modelId"), args.modelId),
        q.eq(q.field("provider"), args.provider)
      )
    )
    .unique();

  if (targetModel) {
    await ctx.db.patch("userImageModels", targetModel._id, {
      selected: true,
    });
    return await ctx.db.get("userImageModels", targetModel._id);
  }

  return null;
}
