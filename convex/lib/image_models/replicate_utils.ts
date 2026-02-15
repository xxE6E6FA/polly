import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import {
  determineAspectRatioSupport,
  determineImageInputSupport,
  determineMultipleImageSupport,
  determineNegativePromptSupport,
} from "./schema_analysis";
import type { ImageModelResult, ReplicateSearchModel } from "./types";

/**
 * Helper to get a validated Replicate API key for actions.
 * Returns null if no key is available.
 */
export async function getReplicateKey(
  ctx: ActionCtx
): Promise<string | null> {
  const apiKeys = await ctx.runQuery(api.apiKeys.getUserApiKeys);

  const replicateKey = apiKeys.find(
    (key: { provider: string; hasKey?: boolean }) =>
      key.provider === "replicate"
  );

  if (!replicateKey?.hasKey) {
    return null;
  }

  const decryptedKey: string | null = await ctx.runAction(
    api.apiKeys.getDecryptedApiKey,
    {
      provider: "replicate" as const,
    }
  );

  return decryptedKey;
}

/**
 * Transform a raw Replicate model into our ImageModelResult format.
 */
export function transformReplicateModel(
  model: ReplicateSearchModel,
  rawModel: Record<string, unknown>
): ImageModelResult {
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

  // Determine image input support (for image-to-image / editing)
  const supportsImageToImage = determineImageInputSupport(
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
    supportsImageToImage,
    supportsMultipleImages,
    supportsNegativePrompt,
    coverImageUrl: coverImageUrl || undefined,
    exampleImages,
  };
}
