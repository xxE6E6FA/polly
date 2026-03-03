/**
 * Discovery Mode orchestrator.
 *
 * Coordinates prompt evolution and image generation for the discovery flow.
 * The AI chooses the best model and aspect ratio for each generation,
 * and can search Replicate for new models when needed.
 * When a seed image is provided, it's analyzed with a vision model to extract
 * a rich description that guides prompt evolution.
 * Reuses existing canvas generation infrastructure.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";
import { DEFAULT_BUILTIN_VISION_MODEL_ID } from "../shared/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { CONFIG } from "./ai/config";
import type {
  AvailableModelInfo,
  DiscoveryPromptResult,
} from "./ai/discovery_prompt";
import { fetchImageData } from "./ai/prompt_generation";
import { getAuthUserId } from "./lib/auth";
import { scheduleRunAfter } from "./lib/scheduler";

const IMAGE_ANALYSIS_PROMPT = `Analyze this image in detail for use as creative inspiration. Describe:
- Subject matter and composition
- Art style, medium, and technique (e.g. photography, oil painting, digital art, watercolor)
- Color palette and lighting
- Mood and atmosphere
- Notable textures, patterns, or visual details
- Any text, symbols, or distinctive elements

Be specific and visual. This description will guide an AI image generation system, so focus on concrete details that can be reproduced or riffed on creatively. 80-150 words.`;

/** Describe a seed image using the same vision model as canvas prompt generation. */
async function describeImage(
  ctx: ActionCtx,
  storageId: Id<"_storage">
): Promise<string | undefined> {
  const apiKey = process.env[CONFIG.PROVIDER_ENV_KEYS.google];
  if (!apiKey) {
    console.error("Discovery: No Google API key for vision model");
    return undefined;
  }

  try {
    const imageData = await fetchImageData(ctx, storageId);
    const google = createGoogleGenerativeAI({ apiKey });
    const model = google.chat(DEFAULT_BUILTIN_VISION_MODEL_ID);

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: imageData.base64,
              mediaType: imageData.mediaType,
            },
            { type: "text", text: IMAGE_ANALYSIS_PROMPT },
          ],
        },
      ],
      maxOutputTokens: 512,
      temperature: 0.3,
    });

    return result.text;
  } catch (error) {
    console.error("Discovery: Image description failed:", error);
    return undefined;
  }
}

/** Fetch available models and format them for the AI prompt. */
async function getModelsForPrompt(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{
  models: AvailableModelInfo[];
  allModels: Array<{
    modelId: string;
    name: string;
    isBuiltIn: boolean;
    free?: boolean;
    description?: string;
    tags?: string[];
  }>;
}> {
  const allModels = await ctx.runQuery(
    internal.imageModels.internalGetAvailableImageModels,
    { userId }
  );

  const models: AvailableModelInfo[] = allModels.map(
    (m: {
      modelId: string;
      name: string;
      description?: string;
      tags?: string[];
    }) => ({
      modelId: m.modelId,
      name: m.name,
      description: m.description,
      tags: m.tags,
    })
  );

  return { models, allModels };
}

/** Pick a fallback model when the AI doesn't specify one. */
function pickFallbackModel(
  allModels: Array<{
    modelId: string;
    isBuiltIn?: boolean;
    free?: boolean;
  }>,
  explicitModelId?: string
): string {
  if (explicitModelId) {
    return explicitModelId;
  }

  // Prefer non-free models; fall back to any active model
  const preferred = allModels.find((m: { free?: boolean }) => !m.free);
  const fallback = allModels[0];
  const chosen = preferred ?? fallback;
  if (!chosen) {
    throw new Error("No image models available");
  }
  return (chosen as { modelId: string }).modelId;
}

/** Search Replicate for a model matching the AI's query and auto-add it. */
async function searchAndAddModel(
  ctx: ActionCtx,
  searchQuery: string
): Promise<string | null> {
  try {
    const searchResult = await ctx.runAction(
      api.imageModels.searchReplicateModels,
      { query: searchQuery }
    );

    if (!searchResult.models || searchResult.models.length === 0) {
      return null;
    }

    // Pick the top result
    const topModel = searchResult.models[0];
    if (!topModel) {
      return null;
    }

    // Auto-add it to the user's models
    const addResult = await ctx.runAction(api.imageModels.addCustomImageModel, {
      modelId: topModel.modelId,
    });

    if (addResult.success) {
      return topModel.modelId;
    }

    return null;
  } catch (error) {
    console.error("Discovery: Replicate search failed:", error);
    return null;
  }
}

export const startDiscoveryGeneration = action({
  args: {
    seedPrompt: v.optional(v.string()),
    seedImageStorageId: v.optional(v.id("_storage")),
    likedPrompts: v.array(v.string()),
    dislikedPrompts: v.array(v.string()),
    modelId: v.optional(v.string()),
    personaId: v.optional(v.id("personas")),
    aspectRatio: v.optional(v.string()),
    sessionId: v.string(),
    isFirstGeneration: v.optional(v.boolean()),
    hint: v.optional(
      v.union(v.literal("remix"), v.literal("wilder"), v.literal("fresh"))
    ),
  },
  returns: v.object({
    generationId: v.id("generations"),
    prompt: v.string(),
    aspectRatio: v.string(),
    modelId: v.string(),
    explanation: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    generationId: Id<"generations">;
    prompt: string;
    aspectRatio: string;
    modelId: string;
    explanation?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Fetch available models for the AI to choose from
    const { models: availableModels, allModels } = await getModelsForPrompt(
      ctx,
      userId
    );

    // If seed image provided and first gen, describe it with a vision model
    let seedImageDescription: string | undefined;
    if (args.seedImageStorageId && args.isFirstGeneration) {
      seedImageDescription = await describeImage(ctx, args.seedImageStorageId);
    }

    // Evolve the prompt — AI also chooses model and aspect ratio
    const result = (await ctx.runAction(
      internal.ai.discovery_prompt.evolveDiscoveryPrompt,
      {
        userId,
        seedPrompt: args.seedPrompt,
        seedImageDescription,
        likedPrompts: args.likedPrompts,
        dislikedPrompts: args.dislikedPrompts,
        personaId: args.personaId,
        isFirstGeneration: args.isFirstGeneration ?? false,
        hint: args.hint,
        availableModels,
      }
    )) as DiscoveryPromptResult;

    const prompt = result.prompt;
    const aspectRatio = result.aspectRatio;

    // Resolve the model — AI choice → search → fallback
    let modelId: string | undefined;

    if (result.modelId) {
      // AI picked a specific available model
      modelId = result.modelId;
    } else if (result.searchQuery) {
      // AI wants a model we don't have — search Replicate
      const foundModelId = await searchAndAddModel(ctx, result.searchQuery);
      if (foundModelId) {
        modelId = foundModelId;
      }
    }

    // Final fallback: use the explicitly passed modelId or pick from available
    if (!modelId) {
      modelId = pickFallbackModel(allModels, args.modelId);
    }

    const explanation = result.explanation;

    // Create generation row
    const generationId: Id<"generations"> = await ctx.runMutation(
      internal.generations.internalCreateGeneration,
      {
        userId,
        prompt,
        model: modelId,
        provider: "replicate",
        params: {
          aspectRatio,
          count: 1,
        },
        batchId: args.sessionId,
        explanation,
      }
    );

    // Schedule the actual image generation
    await scheduleRunAfter(ctx, 0, internal.generations.runCanvasGeneration, {
      generationId,
      userId,
    });

    // Increment session generation count
    await ctx.runMutation(
      internal.discoverySessions.internalIncrementGenerationCount,
      { sessionId: args.sessionId }
    );

    return { generationId, prompt, aspectRatio, modelId, explanation };
  },
});
