import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import Replicate from "replicate";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { imageModelDefinitionSchema } from "./lib/schemas";

// Helper function to determine if a model supports aspect_ratio parameter
function determineAspectRatioSupport(
  model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): string[] {
  const modelId = `${model.owner}/${model.name}`;

  // Check if the model schema has aspect_ratio in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  const aspectRatioProperty = inputProperties?.aspect_ratio as
    | Record<string, unknown>
    | undefined;
  if (aspectRatioProperty) {
    // Model supports aspect_ratio parameter
    const aspectRatioEnum = aspectRatioProperty.enum as unknown;
    if (Array.isArray(aspectRatioEnum)) {
      return aspectRatioEnum.filter(
        (item): item is string => typeof item === "string"
      );
    }
    // Default supported ratios for models that have aspect_ratio but no enum
    return ["1:1", "16:9", "9:16", "4:3", "3:4"];
  }

  // Check if model has width/height parameters instead
  if (inputProperties?.width || inputProperties?.height) {
    // Model uses width/height, mark it as needing dimension conversion
    return ["use_dimensions"];
  }

  // For models we know support aspect ratio (common Flux and SDXL models)
  const aspectRatioSupportedModels = [
    "black-forest-labs/flux-schnell",
    "black-forest-labs/flux-dev",
    "black-forest-labs/flux-pro",
    "stability-ai/sdxl",
    "stability-ai/stable-diffusion-xl-base-1.0",
    "lucataco/sdxl",
  ];

  if (
    aspectRatioSupportedModels.some(supported => modelId.includes(supported))
  ) {
    return ["1:1", "16:9", "9:16", "4:3", "3:4"];
  }

  // Default to using dimensions for unknown models
  return ["use_dimensions"];
}

// Helper function to determine if a model supports negative prompts
// Based on Replicate's OpenAPI schema documentation: https://replicate.com/docs/reference/openapi#model-schemas
// Models support negative prompts if they have a "negative_prompt" parameter of type "string"
function determineNegativePromptSupport(
  _model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): boolean {
  // Check if the model schema has negative_prompt parameter in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  const negativePromptProperty = inputProperties?.negative_prompt as
    | Record<string, unknown>
    | undefined;

  // Check if negative_prompt parameter exists and is of type string
  if (negativePromptProperty) {
    const paramType = negativePromptProperty.type;
    return paramType === "string";
  }

  return false;
}

// Helper function to determine if a model supports generating multiple images
// Based on Replicate's OpenAPI schema documentation: https://replicate.com/docs/reference/openapi#model-schemas
// Models support multiple images if they have a "num_outputs" or "batch_size" parameter of type "integer" with maximum > 1
function determineMultipleImageSupport(
  _model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): boolean {
  // Check if the model schema has num_outputs or batch_size parameter in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  // Look for either num_outputs or batch_size parameter
  const numOutputsProperty = inputProperties?.num_outputs as
    | Record<string, unknown>
    | undefined;
  const batchSizeProperty = inputProperties?.batch_size as
    | Record<string, unknown>
    | undefined;

  // Check num_outputs parameter
  if (numOutputsProperty) {
    const paramType = numOutputsProperty.type;
    const maximum = numOutputsProperty.maximum as number | undefined;

    // Verify it's an integer parameter with maximum > 1 or no maximum limit
    if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
      return true;
    }
  }

  // Check batch_size parameter (some models use this instead)
  if (batchSizeProperty) {
    const paramType = batchSizeProperty.type;
    const maximum = batchSizeProperty.maximum as number | undefined;

    // Verify it's an integer parameter with maximum > 1 or no maximum limit
    if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
      return true;
    }
  }

  // If we can't determine from schema, return false to be conservative
  // Users can still manually enable models and the schema will be populated correctly
  return false;
}

export const getUserImageModels = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    return ctx.db
      .query("userImageModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

// Functions to manage full model definitions
export const getModelDefinition = query({
  args: { modelId: v.string() },
  handler: async (ctx, { modelId }) => {
    return await ctx.db
      .query("imageModelDefinitions")
      .withIndex("by_model_id", q => q.eq("modelId", modelId))
      .first();
  },
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
  handler: async (ctx, args) => {
    const existingModel = await ctx.db
      .query("userImageModels")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .filter(q => q.eq(q.field("modelId"), args.modelId))
      .first();

    if (existingModel) {
      await ctx.db.patch(existingModel._id, {
        supportedAspectRatios: args.supportedAspectRatios,
        supportsMultipleImages: args.supportsMultipleImages,
        supportsNegativePrompt: args.supportsNegativePrompt,
        modelVersion: args.modelVersion,
      });
    }
  },
});

export const storeModelDefinition = internalMutation({
  args: imageModelDefinitionSchema,
  handler: async (ctx, modelDefinition) => {
    // Check if definition already exists
    const existing = await ctx.db
      .query("imageModelDefinitions")
      .withIndex("by_model_id", q => q.eq("modelId", modelDefinition.modelId))
      .first();

    if (existing) {
      // Update existing definition
      await ctx.db.patch(existing._id, {
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
  },
});

export const getModelDefinitions = query({
  args: { modelIds: v.array(v.string()) },
  handler: async (ctx, { modelIds }) => {
    if (modelIds.length === 0) {
      return [];
    }

    const definitions = await Promise.all(
      modelIds.map(modelId =>
        ctx.db
          .query("imageModelDefinitions")
          .withIndex("by_model_id", q => q.eq("modelId", modelId))
          .first()
      )
    );

    return definitions.filter(def => def !== null);
  },
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
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Authentication required");
    }

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
      await ctx.db.delete(existingModel._id);
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

    const inserted = await ctx.db.get(newModel);
    return { action: "added", model: inserted };
  },
});

export const getUserSelectedImageModel = query({
  args: {},
  handler: async ctx => {
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
  },
});

export const setSelectedImageModel = mutation({
  args: {
    modelId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Authentication required");
    }

    // Clear previous selection
    const selectedModels = await ctx.db
      .query("userImageModels")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("selected"), true))
      .collect();

    for (const model of selectedModels) {
      await ctx.db.patch(model._id, { selected: false });
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
      await ctx.db.patch(targetModel._id, { selected: true });
      return await ctx.db.get(targetModel._id);
    }

    return null;
  },
});

interface ReplicateSearchModel {
  owner: string;
  name: string;
  description?: string;
  tags?: string[];
  latestVersion?: {
    id: string;
  };
}

interface ImageModelResult {
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
  supportsNegativePrompt: boolean;
  coverImageUrl?: string;
  exampleImages?: string[];
}

// Fetch all Replicate image models from the curated text-to-image collection
export const fetchReplicateImageModels = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    models: ImageModelResult[];
    nextCursor: string | null;
    hasMore: boolean;
  }> => {
    const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);

    // Find Replicate API key
    const replicateKey = apiKeys.find(
      (key: { provider: string; hasKey?: boolean }) =>
        key.provider === "replicate"
    );

    if (!replicateKey) {
      return { models: [], nextCursor: null, hasMore: false };
    }

    if (!replicateKey.hasKey) {
      return { models: [], nextCursor: null, hasMore: false };
    }

    try {
      // Get the decrypted API key
      const decryptedKey: string | null = await ctx.runAction(
        api.apiKeys.getDecryptedApiKey,
        {
          provider: "replicate" as const,
        }
      );

      if (!decryptedKey) {
        return { models: [], nextCursor: null, hasMore: false };
      }

      // Use the official Replicate client to fetch the curated text-to-image collection
      const replicate = new Replicate({
        auth: decryptedKey,
      });

      // Fetch the text-to-image collection - this is already curated by Replicate
      const collection = await replicate.collections.get("text-to-image");
      const allModels = collection.models || [];

      // Transform all models from the curated collection to our format
      const imageModels: ImageModelResult[] = allModels.map(
        (model: ReplicateSearchModel): ImageModelResult => {
          const rawModel = model as unknown as Record<string, unknown>;
          const latestVersion = rawModel.latest_version as
            | Record<string, unknown>
            | undefined;
          const coverImageUrl = rawModel.cover_image_url as
            | string
            | null
            | undefined;
          const defaultExample = rawModel.default_example as
            | Record<string, unknown>
            | undefined;
          const exampleOutput = defaultExample?.output;

          // Extract example images from the output
          let exampleImages: string[] | undefined;
          if (exampleOutput) {
            if (Array.isArray(exampleOutput)) {
              exampleImages = exampleOutput.filter(
                (url): url is string => typeof url === "string"
              );
            } else if (typeof exampleOutput === "string") {
              exampleImages = [exampleOutput];
            }
          }

          // Determine aspect ratio support based on model schema
          const supportedAspectRatios = determineAspectRatioSupport(
            model,
            latestVersion
          );

          // Determine multiple image support based on model schema
          const supportsMultipleImages = determineMultipleImageSupport(
            model,
            latestVersion
          );

          // Determine negative prompt support based on model schema
          const supportsNegativePrompt = determineNegativePromptSupport(
            model,
            latestVersion
          );

          return {
            modelId: `${model.owner}/${model.name}`,
            name: model.name,
            provider: "replicate",
            description: model.description || "",
            modelVersion: String(latestVersion?.id || ""),
            owner: model.owner,
            tags: model.tags || [],
            supportedAspectRatios,
            supportsUpscaling: false,
            supportsInpainting: false,
            supportsOutpainting: false,
            supportsImageToImage: false,
            supportsMultipleImages,
            supportsNegativePrompt,
            coverImageUrl: coverImageUrl || undefined,
            exampleImages,
          };
        }
      );

      return {
        models: imageModels,
        nextCursor: null,
        hasMore: false,
      };
    } catch (error) {
      console.error("Error fetching Replicate image models:", error);
      return { models: [], nextCursor: null, hasMore: false };
    }
  },
});

// Search for Replicate models using their search API
export const searchReplicateModels = action({
  args: {
    query: v.string(),
  },
  handler: async (
    ctx,
    { query }
  ): Promise<{
    models: ImageModelResult[];
    nextCursor: string | null;
    hasMore: boolean;
  }> => {
    const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);

    // Find Replicate API key
    const replicateKey = apiKeys.find(
      (key: { provider: string; hasKey?: boolean }) =>
        key.provider === "replicate"
    );

    if (!replicateKey) {
      return { models: [], nextCursor: null, hasMore: false };
    }

    if (!replicateKey.hasKey) {
      return { models: [], nextCursor: null, hasMore: false };
    }

    try {
      // Get the decrypted API key
      const decryptedKey: string | null = await ctx.runAction(
        api.apiKeys.getDecryptedApiKey,
        {
          provider: "replicate" as const,
        }
      );

      if (!decryptedKey) {
        return { models: [], nextCursor: null, hasMore: false };
      }

      // Use the official Replicate client for searching models
      const replicate = new Replicate({ auth: decryptedKey });

      const searchResults = await replicate.models.search(query);

      const models = searchResults.results || [];

      // Filter for image generation models and transform to our format
      const imageModels: ImageModelResult[] = models
        .filter((model: ReplicateSearchModel) => {
          // Check if this model is likely an image generation model
          const description = (model.description || "").toLowerCase();
          const tags = (model.tags || []).map(tag => tag.toLowerCase());

          // Look for image-related keywords
          const imageKeywords = [
            "image",
            "picture",
            "photo",
            "visual",
            "generate",
            "create",
            "diffusion",
            "flux",
            "sdxl",
            "stable",
            "dall",
            "midjourney",
            "art",
            "artistic",
            "painting",
            "drawing",
            "sketch",
            "illustration",
          ];

          return imageKeywords.some(
            keyword =>
              description.includes(keyword) ||
              tags.some(tag => tag.includes(keyword))
          );
        })
        .map((model: ReplicateSearchModel): ImageModelResult => {
          const rawModel = model as unknown as Record<string, unknown>;
          const latestVersion = rawModel.latest_version as
            | Record<string, unknown>
            | undefined;
          const coverImageUrl = rawModel.cover_image_url as
            | string
            | null
            | undefined;
          const defaultExample = rawModel.default_example as
            | Record<string, unknown>
            | undefined;
          const exampleOutput = defaultExample?.output;

          // Extract example images from the output
          let exampleImages: string[] | undefined;
          if (exampleOutput) {
            if (Array.isArray(exampleOutput)) {
              exampleImages = exampleOutput.filter(
                (url): url is string => typeof url === "string"
              );
            } else if (typeof exampleOutput === "string") {
              exampleImages = [exampleOutput];
            }
          }

          // Determine aspect ratio support based on model schema
          const supportedAspectRatios = determineAspectRatioSupport(
            model,
            latestVersion
          );

          // Determine multiple image support based on model schema
          const supportsMultipleImages = determineMultipleImageSupport(
            model,
            latestVersion
          );

          // Determine negative prompt support based on model schema
          const supportsNegativePrompt = determineNegativePromptSupport(
            model,
            latestVersion
          );

          return {
            modelId: `${model.owner}/${model.name}`,
            name: model.name,
            provider: "replicate",
            description: model.description || "",
            modelVersion: String(latestVersion?.id || ""),
            owner: model.owner,
            tags: model.tags || [],
            supportedAspectRatios,
            supportsUpscaling: false,
            supportsInpainting: false,
            supportsOutpainting: false,
            supportsImageToImage: false,
            supportsMultipleImages,
            supportsNegativePrompt,
            coverImageUrl: coverImageUrl || undefined,
            exampleImages,
          };
        });

      return {
        models: imageModels,
        nextCursor: searchResults.next || null,
        hasMore: !!searchResults.next,
      };
    } catch (error) {
      console.error("Error searching Replicate models:", error);
      return { models: [], nextCursor: null, hasMore: false };
    }
  },
});

// Refresh capabilities for user's selected image models
export const refreshModelCapabilities = action({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    // Get user's selected image models
    const userModels = await ctx.runQuery(api.imageModels.getUserImageModels);

    if (userModels.length === 0) {
      return {
        success: true,
        message: "No models to refresh",
        updated: 0,
      };
    }

    // Get Replicate API key
    const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);
    const replicateKey = apiKeys.find(
      (key: { provider: string; hasKey?: boolean }) =>
        key.provider === "replicate" && key.hasKey
    );

    if (!replicateKey) {
      throw new Error(
        "No Replicate API key found. Please add one in Settings → API Keys."
      );
    }

    const decryptedKey: string | null = await ctx.runAction(
      api.apiKeys.getDecryptedApiKey,
      { provider: "replicate" as const }
    );

    if (!decryptedKey) {
      throw new Error("Failed to decrypt Replicate API key");
    }

    let updatedCount = 0;
    const errors: string[] = [];

    // Process each model
    for (const userModel of userModels) {
      try {
        // Fetch latest model version and schema from Replicate
        const headers = new Headers();
        headers.set("Authorization", `Bearer ${decryptedKey}`);
        headers.set("Content-Type", "application/json");

        const modelResponse = await fetch(
          `https://api.replicate.com/v1/models/${userModel.modelId}`,
          {
            method: "GET",
            headers,
          }
        );

        if (!modelResponse.ok) {
          errors.push(
            `Failed to fetch ${userModel.modelId}: ${modelResponse.statusText}`
          );
          continue;
        }

        const modelData = await modelResponse.json();
        const latestVersion = modelData.latest_version;

        if (!latestVersion) {
          errors.push(`No version available for ${userModel.modelId}`);
          continue;
        }

        const owner =
          userModel.owner ??
          userModel.modelId.split("/")[0] ??
          userModel.modelId;
        const name = userModel.name ?? userModel.modelId;
        const description = userModel.description ?? "";

        // Re-analyze capabilities using the latest schema
        const supportedAspectRatios = determineAspectRatioSupport(
          {
            owner,
            name,
            description,
          },
          latestVersion
        );

        const supportsMultipleImages = determineMultipleImageSupport(
          {
            owner,
            name,
            description,
          },
          latestVersion
        );

        const supportsNegativePrompt = determineNegativePromptSupport(
          {
            owner,
            name,
            description,
          },
          latestVersion
        );

        // Update the user model with refreshed capabilities
        await ctx.runMutation(
          internal.imageModels.updateUserModelCapabilities,
          {
            userId,
            modelId: userModel.modelId,
            supportedAspectRatios,
            supportsMultipleImages,
            supportsNegativePrompt,
            modelVersion: latestVersion.id,
          }
        );

        // Also update the model definition if it exists
        const existingDefinition = await ctx.runQuery(
          api.imageModels.getModelDefinition,
          {
            modelId: userModel.modelId,
          }
        );

        if (existingDefinition) {
          await ctx.runMutation(internal.imageModels.storeModelDefinition, {
            modelId: userModel.modelId,
            name: userModel.name,
            provider: userModel.provider,
            description: userModel.description || "",
            modelVersion: latestVersion.id,
            owner:
              userModel.owner ??
              userModel.modelId.split("/")[0] ??
              userModel.modelId,
            tags: userModel.tags || [],
            supportedAspectRatios,
            supportsUpscaling: existingDefinition.supportsUpscaling,
            supportsInpainting: existingDefinition.supportsInpainting,
            supportsOutpainting: existingDefinition.supportsOutpainting,
            supportsImageToImage: existingDefinition.supportsImageToImage,
            supportsMultipleImages,
            supportsNegativePrompt,
            coverImageUrl: existingDefinition.coverImageUrl,
            exampleImages: existingDefinition.exampleImages,
            createdAt: existingDefinition.createdAt,
            lastUpdated: Date.now(),
          });
        }

        updatedCount++;
      } catch (error) {
        console.error(`Error refreshing ${userModel.modelId}:`, error);
        errors.push(
          `${userModel.modelId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return {
      success: true,
      message: `Refreshed capabilities for ${updatedCount} models${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

// Add a custom model by fetching its details from Replicate
export const addCustomImageModel = action({
  args: {
    modelId: v.string(),
  },
  handler: async (
    ctx,
    { modelId }
  ): Promise<{
    success: boolean;
    message: string;
    model?: ImageModelResult;
  }> => {
    // Sanitize the model ID at the start so it's available throughout the function
    const sanitizedModelId = modelId.trim().replace(/\s+/g, "");
    const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);

    const replicateKey = apiKeys.find(
      (key: { provider: string; hasKey?: boolean }) =>
        key.provider === "replicate"
    );

    if (!replicateKey?.hasKey) {
      return { success: false, message: "Replicate API key not found" };
    }

    try {
      const decryptedKey: string | null = await ctx.runAction(
        api.apiKeys.getDecryptedApiKey,
        {
          provider: "replicate" as const,
        }
      );

      if (!decryptedKey) {
        return {
          success: false,
          message: "Failed to decrypt Replicate API key",
        };
      }

      const replicate = new Replicate({
        auth: decryptedKey,
      });

      // Parse the sanitized model ID to get owner and name
      const parts = sanitizedModelId.split("/");
      if (parts.length !== 2) {
        return {
          success: false,
          message:
            "Invalid model ID format. Use 'owner/model-name' (e.g., 'stability-ai/sdxl')",
        };
      }

      const [owner, name] = parts;
      if (!owner) {
        return {
          success: false,
          message: "Please provide an owner name (e.g., 'stability-ai/sdxl')",
        };
      }
      if (!name) {
        return {
          success: false,
          message: "Please provide a model name (e.g., 'stability-ai/sdxl')",
        };
      }

      // Fetch the model details
      const model = await replicate.models.get(owner, name);

      if (!model) {
        return { success: false, message: "Model not found" };
      }

      // Transform to our format
      const rawModel = model as unknown as Record<string, unknown>;
      const latestVersion = rawModel.latest_version as
        | Record<string, unknown>
        | undefined;
      const coverImageUrl = rawModel.cover_image_url as
        | string
        | null
        | undefined;
      const defaultExample = rawModel.default_example as
        | Record<string, unknown>
        | undefined;
      const exampleOutput = defaultExample?.output;

      let exampleImages: string[] | undefined;
      if (exampleOutput) {
        if (Array.isArray(exampleOutput)) {
          exampleImages = exampleOutput.filter(
            (url): url is string => typeof url === "string"
          );
        } else if (typeof exampleOutput === "string") {
          exampleImages = [exampleOutput];
        }
      }

      // Determine aspect ratio support for the custom model
      const supportedAspectRatios = determineAspectRatioSupport(
        {
          owner: model.owner,
          name: model.name,
          description: model.description,
        },
        latestVersion
      );

      // Determine multiple image support for the custom model
      const supportsMultipleImages = determineMultipleImageSupport(
        {
          owner: model.owner,
          name: model.name,
          description: model.description,
        },
        latestVersion
      );

      const supportsNegativePrompt = determineNegativePromptSupport(
        {
          owner: model.owner,
          name: model.name,
          description: model.description,
        },
        latestVersion
      );

      const imageModel: ImageModelResult = {
        modelId: sanitizedModelId,
        name: model.name,
        provider: "replicate",
        description: model.description || "",
        modelVersion: String(latestVersion?.id || ""),
        owner: model.owner,
        tags: (rawModel.tags as string[]) || [],
        supportedAspectRatios,
        supportsUpscaling: false,
        supportsInpainting: false,
        supportsOutpainting: false,
        supportsImageToImage: false,
        supportsMultipleImages,
        supportsNegativePrompt,
        coverImageUrl: coverImageUrl || undefined,
        exampleImages,
      };

      // Store the full model definition first
      await ctx.runMutation(internal.imageModels.storeModelDefinition, {
        modelId: imageModel.modelId,
        name: imageModel.name,
        provider: imageModel.provider,
        description: imageModel.description,
        modelVersion: imageModel.modelVersion,
        owner: imageModel.owner,
        tags: imageModel.tags,
        supportedAspectRatios: imageModel.supportedAspectRatios,
        supportsUpscaling: imageModel.supportsUpscaling,
        supportsInpainting: imageModel.supportsInpainting,
        supportsOutpainting: imageModel.supportsOutpainting,
        supportsImageToImage: imageModel.supportsImageToImage,
        supportsMultipleImages: imageModel.supportsMultipleImages,
        supportsNegativePrompt: imageModel.supportsNegativePrompt,
        coverImageUrl: imageModel.coverImageUrl,
        exampleImages: imageModel.exampleImages,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      });

      // Add the custom model to user's selected models
      const userId = await getAuthUserId(ctx);
      if (userId) {
        await ctx.runMutation(api.imageModels.toggleImageModel, {
          modelId: imageModel.modelId,
          provider: imageModel.provider,
          name: imageModel.name,
          description: imageModel.description,
          modelVersion: imageModel.modelVersion,
          owner: imageModel.owner,
          tags: imageModel.tags,
          supportedAspectRatios: imageModel.supportedAspectRatios,
          supportsUpscaling: imageModel.supportsUpscaling,
          supportsInpainting: imageModel.supportsInpainting,
          supportsOutpainting: imageModel.supportsOutpainting,
          supportsImageToImage: imageModel.supportsImageToImage,
          supportsMultipleImages: imageModel.supportsMultipleImages,
          supportsNegativePrompt: imageModel.supportsNegativePrompt,
        });
      }

      return {
        success: true,
        message: `Added ${imageModel.name} by ${imageModel.owner}`,
        model: imageModel,
      };
    } catch (error) {
      console.error("Error adding custom image model:", error);

      // Parse the error to provide user-friendly messages
      if (error instanceof Error) {
        const errorMessage = error.message;

        // Handle 404 - Model not found
        if (
          errorMessage.includes("404") ||
          errorMessage.includes("Not Found")
        ) {
          return {
            success: false,
            message: `Model "${sanitizedModelId}" not found on Replicate. Please verify the model ID is correct and the model exists.`,
          };
        }

        // Handle 401 - Unauthorized
        if (
          errorMessage.includes("401") ||
          errorMessage.includes("Unauthorized")
        ) {
          return {
            success: false,
            message:
              "Invalid Replicate API key. Please check your API key in settings.",
          };
        }

        // Handle 403 - Forbidden
        if (
          errorMessage.includes("403") ||
          errorMessage.includes("Forbidden")
        ) {
          return {
            success: false,
            message:
              "Access denied. Please check your Replicate API key permissions.",
          };
        }

        // Handle 429 - Rate limit
        if (
          errorMessage.includes("429") ||
          errorMessage.includes("rate limit")
        ) {
          return {
            success: false,
            message: "Rate limit exceeded. Please wait a moment and try again.",
          };
        }

        // Handle network/timeout errors
        if (
          errorMessage.includes("fetch") ||
          errorMessage.includes("network") ||
          errorMessage.includes("timeout")
        ) {
          return {
            success: false,
            message:
              "Network error. Please check your connection and try again.",
          };
        }
      }

      // Generic fallback
      return {
        success: false,
        message: `Failed to add model "${sanitizedModelId}". Please check the model ID format (owner/model-name) and ensure the model exists on Replicate.`,
      };
    }
  },
});
