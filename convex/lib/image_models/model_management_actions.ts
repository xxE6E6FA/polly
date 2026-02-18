import { getAuthUserId } from "../auth";
import Replicate from "replicate";
import { api, internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { sanitizeSchema } from "../shared_utils";
import {
  determineAspectRatioSupport,
  determineMultipleImageSupport,
  determineNegativePromptSupport,
} from "./schema_analysis";
import { transformReplicateModel } from "./replicate_utils";
import type { ImageModelResult } from "./types";

// Refresh capabilities for user's selected image models
export async function refreshModelCapabilitiesHandler(ctx: ActionCtx) {
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
      "No Replicate API key found. Please add one in Settings \u2192 API Keys."
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

      const modelData = await modelResponse.json() as { latest_version?: { id: string } };
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
}

// Fetch the OpenAPI schema for a specific model
export async function fetchModelSchemaHandler(
  ctx: ActionCtx,
  args: { modelId: string }
) {
  const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);

  const replicateKey = apiKeys.find(
    (key: { provider: string; hasKey?: boolean }) =>
      key.provider === "replicate"
  );

  if (!replicateKey?.hasKey) {
    return { success: false, error: "Replicate API key not found" };
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
        error: "Failed to decrypt Replicate API key",
      };
    }

    const replicate = new Replicate({
      auth: decryptedKey,
    });

    const [owner, name] = args.modelId.split("/");
    if (!(owner && name)) {
      return {
        success: false,
        error: "Invalid model ID format. Use 'owner/name' format.",
      };
    }

    const model = await replicate.models.get(owner, name);

    if (!model) {
      return { success: false, error: "Model not found" };
    }

    const rawModel = model as unknown as Record<string, unknown>;
    const latestVersion = rawModel.latest_version as
      | Record<string, unknown>
      | undefined;

    return {
      success: true,
      schema: sanitizeSchema(latestVersion?.openapi_schema) || null,
      modelVersion: latestVersion?.id || null,
    };
  } catch (error) {
    console.error("Error fetching model schema:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch schema",
    };
  }
}

// Add a custom model by fetching its details from Replicate
export async function addCustomImageModelHandler(
  ctx: ActionCtx,
  args: { modelId: string }
): Promise<{
  success: boolean;
  message: string;
  model?: ImageModelResult;
}> {
  // Sanitize the model ID at the start so it's available throughout the function
  const sanitizedModelId = args.modelId.trim().replace(/\s+/g, "");
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

    const imageModel = transformReplicateModel(
      {
        owner: model.owner,
        name: model.name,
        description: model.description,
        tags: rawModel.tags as string[],
      },
      rawModel
    );
    // Override modelId with sanitized version
    imageModel.modelId = sanitizedModelId;

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
}
