import Replicate from "replicate";
import type { ActionCtx } from "../../_generated/server";
import { getReplicateKey, transformReplicateModel } from "./replicate_utils";
import type { ImageModelResult, ReplicateSearchModel } from "./types";

// Fetch all Replicate image models from the curated text-to-image collection
export async function fetchReplicateImageModelsHandler(
  ctx: ActionCtx
): Promise<{
  models: ImageModelResult[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const decryptedKey = await getReplicateKey(ctx);

  if (!decryptedKey) {
    return { models: [], nextCursor: null, hasMore: false };
  }

  try {
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
        return transformReplicateModel(model, rawModel);
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
}

// Search for Replicate models using their search API
export async function searchReplicateModelsHandler(
  ctx: ActionCtx,
  args: { query: string }
): Promise<{
  models: ImageModelResult[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const decryptedKey = await getReplicateKey(ctx);

  if (!decryptedKey) {
    return { models: [], nextCursor: null, hasMore: false };
  }

  try {
    // Use the official Replicate client for searching models
    const replicate = new Replicate({ auth: decryptedKey });

    const searchResults = await replicate.models.search(args.query);

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
        return transformReplicateModel(model, rawModel);
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
}
