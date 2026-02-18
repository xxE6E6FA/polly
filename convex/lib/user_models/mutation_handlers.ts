import { getAuthUserId } from "../auth";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

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

    const operations: Promise<unknown>[] = [];

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

  const operations: Promise<unknown>[] = [
    ctx.db.patch("userModels", model._id, { selected: true }),
  ];

  if (selectedModel) {
    operations.push(
      ctx.db.patch("userModels", selectedModel._id, { selected: false })
    );
  }

  const [, userSettings] = await Promise.all([
    Promise.all(operations),
    ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique(),
  ] as const);

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
