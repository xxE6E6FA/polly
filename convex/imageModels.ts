import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  getAvailableImageModelsHandler,
  getBuiltInImageModelByModelIdHandler,
  getBuiltInImageModelsHandler,
  getModelDefinitionHandler,
  getModelDefinitionsHandler,
  getSelectedImageModelWithFallbackHandler,
  getUserImageModelsHandler,
  getUserImageModelsInternalHandler,
  getUserSelectedImageModelHandler,
  setSelectedImageModelHandler,
  storeModelDefinitionHandler,
  toggleImageModelHandler,
  updateUserModelCapabilitiesHandler,
} from "./lib/image_models/handlers";
import {
  addCustomImageModelHandler,
  fetchModelSchemaHandler,
  refreshModelCapabilitiesHandler,
} from "./lib/image_models/model_management_actions";
import {
  fetchReplicateImageModelsHandler,
  searchReplicateModelsHandler,
} from "./lib/image_models/replicate_actions";
import { imageModelDefinitionSchema } from "./lib/schemas";

// ============================================================================
// Convex function registrations
// ============================================================================

export const getUserImageModels = query({
  args: {},
  handler: getUserImageModelsHandler,
});

export const getUserImageModelsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: getUserImageModelsInternalHandler,
});

export const getBuiltInImageModels = query({
  args: {},
  handler: getBuiltInImageModelsHandler,
});

export const getBuiltInImageModelByModelId = internalQuery({
  args: { modelId: v.string() },
  handler: getBuiltInImageModelByModelIdHandler,
});

export const getAvailableImageModels = query({
  args: {},
  handler: getAvailableImageModelsHandler,
});

export const getSelectedImageModelWithFallback = query({
  args: {},
  handler: getSelectedImageModelWithFallbackHandler,
});

export const getModelDefinition = query({
  args: { modelId: v.string() },
  handler: getModelDefinitionHandler,
});

export const updateUserModelCapabilities = internalMutation({
  args: {
    userId: v.id("users"),
    modelId: v.string(),
    supportedAspectRatios: v.array(v.string()),
    supportsMultipleImages: v.boolean(),
    supportsNegativePrompt: v.boolean(),
    modelVersion: v.string(),
  },
  handler: updateUserModelCapabilitiesHandler,
});

export const storeModelDefinition = internalMutation({
  args: imageModelDefinitionSchema,
  handler: storeModelDefinitionHandler,
});

export const getModelDefinitions = query({
  args: { modelIds: v.array(v.string()) },
  handler: getModelDefinitionsHandler,
});

export const toggleImageModel = mutation({
  args: {
    modelId: v.string(),
    provider: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
    owner: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    supportedAspectRatios: v.optional(v.array(v.string())),
    supportsUpscaling: v.optional(v.boolean()),
    supportsInpainting: v.optional(v.boolean()),
    supportsOutpainting: v.optional(v.boolean()),
    supportsImageToImage: v.optional(v.boolean()),
    supportsMultipleImages: v.optional(v.boolean()),
    supportsNegativePrompt: v.optional(v.boolean()),
  },
  handler: toggleImageModelHandler,
});

export const getUserSelectedImageModel = query({
  args: {},
  handler: getUserSelectedImageModelHandler,
});

export const setSelectedImageModel = mutation({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: setSelectedImageModelHandler,
});

export const fetchReplicateImageModels = action({
  args: {},
  handler: fetchReplicateImageModelsHandler,
});

export const searchReplicateModels = action({
  args: {
    query: v.string(),
  },
  handler: searchReplicateModelsHandler,
});

export const refreshModelCapabilities = action({
  args: {},
  handler: refreshModelCapabilitiesHandler,
});

export const fetchModelSchema = action({
  args: {
    modelId: v.string(),
  },
  handler: fetchModelSchemaHandler,
});

export const addCustomImageModel = action({
  args: {
    modelId: v.string(),
  },
  handler: addCustomImageModelHandler,
});
