import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { userModelInputSchema } from "./lib/schemas";

export {
  removeModelHandler,
  removeUnavailableModelsHandler,
  selectModelHandler,
  toggleModelHandler,
  updateModelAvailabilityHandler,
} from "./lib/user_models/mutation_handlers";
// Re-export handler functions for tests
export {
  checkModelConflictHandler,
  getAllProviderModelsHandler,
  getAvailableModelsHandler,
  getBuiltInModelsHandler,
  getModelByIDHandler,
  getRecentlyUsedModelsHandler,
  getUnavailableModelIdsHandler,
  getUserModelsHandler,
  getUserSelectedModelHandler,
  hasUserModelsHandler,
} from "./lib/user_models/query_handlers";

import {
  removeModelHandler,
  removeUnavailableModelsHandler,
  selectModelHandler,
  toggleModelHandler,
  updateModelAvailabilityHandler,
} from "./lib/user_models/mutation_handlers";
import {
  checkModelConflictHandler,
  getAllProviderModelsHandler,
  getAvailableModelsHandler,
  getBuiltInModelsHandler,
  getModelByIDHandler,
  getRecentlyUsedModelsHandler,
  getUnavailableModelIdsHandler,
  getUserModelsHandler,
  getUserSelectedModelHandler,
  hasUserModelsHandler,
} from "./lib/user_models/query_handlers";

// ============================================================================
// Convex function registrations
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

export const getAllProviderModels = query({
  args: {
    providers: v.array(v.string()),
  },
  handler: getAllProviderModelsHandler,
});
