import { v } from "convex/values";
import Replicate from "replicate";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getApiKey } from "./ai/encryption";
import { getUserFriendlyErrorMessage } from "./ai/error_handlers";
import { getAuthUserId } from "./lib/auth";
import { scheduleRunAfter } from "./lib/scheduler";

// ============================================================================
// Queries
// ============================================================================

export const listGenerations = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { generations: [], continueCursor: null };
    }

    const limit = args.limit ?? 50;

    const results = await ctx.db
      .query("generations")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;

    // Resolve storage URLs for images
    const generations = await Promise.all(
      page.map(async gen => {
        let imageUrls: string[] = [];
        if (gen.storageIds) {
          const urls = await Promise.all(
            gen.storageIds.map(id => ctx.storage.getUrl(id))
          );
          imageUrls = urls.filter((u): u is string => u !== null);
        }
        return { ...gen, imageUrls };
      })
    );

    return {
      generations,
      continueCursor: hasMore ? page[page.length - 1]?._id : null,
    };
  },
});

export const getGeneration = query({
  args: { id: v.id("generations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      return null;
    }

    let imageUrls: string[] = [];
    if (gen.storageIds) {
      const urls = await Promise.all(
        gen.storageIds.map(id => ctx.storage.getUrl(id))
      );
      imageUrls = urls.filter((u): u is string => u !== null);
    }
    return { ...gen, imageUrls };
  },
});

// Internal query for webhook/action lookups
export const getByReplicateId = internalQuery({
  args: { replicateId: v.string() },
  handler: (ctx, args) => {
    return ctx.db
      .query("generations")
      .withIndex("by_replicate_id", q => q.eq("replicateId", args.replicateId))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const createGeneration = mutation({
  args: {
    prompt: v.string(),
    model: v.string(),
    provider: v.string(),
    params: v.optional(
      v.object({
        aspectRatio: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        steps: v.optional(v.number()),
        guidanceScale: v.optional(v.number()),
        seed: v.optional(v.number()),
        negativePrompt: v.optional(v.string()),
        count: v.optional(v.number()),
        quality: v.optional(v.number()),
      })
    ),
    batchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return ctx.db.insert("generations", {
      userId,
      prompt: args.prompt,
      model: args.model,
      provider: args.provider,
      status: "pending",
      params: args.params,
      batchId: args.batchId,
      createdAt: Date.now(),
    });
  },
});

// Internal mutations for actions to update generation state
export const updateGenerationStatus = internalMutation({
  args: {
    id: v.id("generations"),
    status: v.string(),
    replicateId: v.optional(v.string()),
    error: v.optional(v.string()),
    duration: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { status: args.status };
    if (args.replicateId !== undefined) {
      updates.replicateId = args.replicateId;
    }
    if (args.error !== undefined) {
      updates.error = args.error;
    }
    if (args.duration !== undefined) {
      updates.duration = args.duration;
    }
    if (args.completedAt !== undefined) {
      updates.completedAt = args.completedAt;
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const storeGenerationImages = internalMutation({
  args: {
    id: v.id("generations"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { storageIds: args.storageIds });
  },
});

export const deleteGeneration = mutation({
  args: { id: v.id("generations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }

    // Delete stored files
    if (gen.storageIds) {
      for (const storageId of gen.storageIds) {
        await ctx.storage.delete(storageId);
      }
    }
    await ctx.db.delete(args.id);
  },
});

export const retryGeneration = mutation({
  args: { id: v.id("generations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }

    // Reset status
    await ctx.db.patch(args.id, {
      status: "pending",
      error: undefined,
      replicateId: undefined,
      completedAt: undefined,
      duration: undefined,
    });

    return args.id;
  },
});

// ============================================================================
// Actions
// ============================================================================

// Helper: convert aspect ratio to width/height (reused from replicate.ts)
function convertAspectRatioToDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  const baseSize = 1024;
  const roundToMultipleOf8 = (value: number): number =>
    Math.round(value / 8) * 8;

  switch (aspectRatio) {
    case "1:1":
      return { width: baseSize, height: baseSize };
    case "16:9":
      return {
        width: roundToMultipleOf8(baseSize * (16 / 9)),
        height: baseSize,
      };
    case "9:16":
      return {
        width: baseSize,
        height: roundToMultipleOf8(baseSize * (16 / 9)),
      };
    case "4:3":
      return {
        width: roundToMultipleOf8(baseSize * (4 / 3)),
        height: baseSize,
      };
    case "3:4":
      return {
        width: baseSize,
        height: roundToMultipleOf8(baseSize * (4 / 3)),
      };
    default: {
      const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
      if (widthRatio && heightRatio) {
        const ratio = widthRatio / heightRatio;
        if (ratio > 1) {
          return {
            width: roundToMultipleOf8(baseSize * ratio),
            height: baseSize,
          };
        }
        return {
          width: baseSize,
          height: roundToMultipleOf8(baseSize / ratio),
        };
      }
      return { width: baseSize, height: baseSize };
    }
  }
}

// Helper: detect aspect ratio support from OpenAPI schema
function detectAspectRatioSupportFromSchema(
  // biome-ignore lint/suspicious/noExplicitAny: Replicate model data has dynamic schema structure
  modelData: any
): "aspect_ratio" | "dimensions" | "none" {
  try {
    const inputProps =
      modelData?.latest_version?.openapi_schema?.components?.schemas?.Input
        ?.properties;
    if (!inputProps || typeof inputProps !== "object") {
      return "none";
    }
    if (inputProps.aspect_ratio) {
      return "aspect_ratio";
    }
    if (inputProps.width || inputProps.height) {
      return "dimensions";
    }
    return "none";
  } catch {
    return "none";
  }
}

export const startCanvasBatch = action({
  args: {
    prompt: v.string(),
    modelIds: v.array(v.string()),
    params: v.optional(
      v.object({
        aspectRatio: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        steps: v.optional(v.number()),
        guidanceScale: v.optional(v.number()),
        seed: v.optional(v.number()),
        negativePrompt: v.optional(v.string()),
        count: v.optional(v.number()),
        quality: v.optional(v.number()),
      })
    ),
    batchId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Create generation rows for each model
    const generationIds: Id<"generations">[] = [];
    for (const modelId of args.modelIds) {
      const id = await ctx.runMutation(
        internal.generations.internalCreateGeneration,
        {
          userId,
          prompt: args.prompt,
          model: modelId,
          provider: "replicate",
          params: args.params,
          batchId: args.batchId,
        }
      );
      generationIds.push(id);
    }

    // Schedule generation for each
    for (const genId of generationIds) {
      await scheduleRunAfter(ctx, 0, internal.generations.runCanvasGeneration, {
        generationId: genId,
        userId,
      });
    }

    return { generationIds, batchId: args.batchId };
  },
});

// Internal mutation for actions to create generation rows
export const internalCreateGeneration = internalMutation({
  args: {
    userId: v.id("users"),
    prompt: v.string(),
    model: v.string(),
    provider: v.string(),
    params: v.optional(
      v.object({
        aspectRatio: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        steps: v.optional(v.number()),
        guidanceScale: v.optional(v.number()),
        seed: v.optional(v.number()),
        negativePrompt: v.optional(v.string()),
        count: v.optional(v.number()),
        quality: v.optional(v.number()),
      })
    ),
    batchId: v.optional(v.string()),
  },
  handler: (ctx, args) => {
    return ctx.db.insert("generations", {
      userId: args.userId,
      prompt: args.prompt,
      model: args.model,
      provider: args.provider,
      status: "pending",
      params: args.params,
      batchId: args.batchId,
      createdAt: Date.now(),
    });
  },
});

export const runCanvasGeneration = internalAction({
  args: {
    generationId: v.id("generations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Get the generation record
      const gen = await ctx.runQuery(
        internal.generations.internalGetGeneration,
        { id: args.generationId }
      );
      if (!gen) {
        throw new Error("Generation not found");
      }

      // Get user's Replicate API key (no free model fallback for canvas)
      const apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        undefined,
        args.userId
      );

      const replicate = new Replicate({ auth: apiKey });

      // Generate random seed if not provided
      const seed = gen.params?.seed ?? Math.floor(Math.random() * 2147483647);

      // Resolve model and detect schema
      const [owner, name] = gen.model.split("/");
      if (!(owner && name)) {
        throw new Error("Model must be specified as 'owner/name'");
      }

      const modelData = await replicate.models.get(owner, name);
      const latestVersion = modelData.latest_version?.id;
      if (!latestVersion) {
        throw new Error(`No version available for model: ${gen.model}`);
      }

      const aspectRatioMode = detectAspectRatioSupportFromSchema(modelData);

      // Get schema properties for parameter mapping
      // biome-ignore lint/suspicious/noExplicitAny: Replicate model data has dynamic OpenAPI schema
      const modelDataAny = modelData as any;
      const inputProps =
        modelDataAny?.latest_version?.openapi_schema?.components?.schemas?.Input
          ?.properties;
      const schemaHasParam = (paramNames: string[]): string | null => {
        if (!inputProps || typeof inputProps !== "object") {
          return null;
        }
        for (const n of paramNames) {
          if (n in inputProps) {
            return n;
          }
        }
        return null;
      };

      // Build input
      const input: Record<string, unknown> = { prompt: gen.prompt };

      // Aspect ratio / dimensions
      if (gen.params?.aspectRatio) {
        if (aspectRatioMode === "aspect_ratio") {
          input.aspect_ratio = gen.params.aspectRatio;
        } else if (aspectRatioMode === "dimensions") {
          const dims = convertAspectRatioToDimensions(gen.params.aspectRatio);
          input.width = dims.width;
          input.height = dims.height;
        } else {
          input.aspect_ratio = gen.params.aspectRatio;
        }
      }

      if (gen.params?.width && !gen.params?.aspectRatio) {
        input.width = gen.params.width;
      }
      if (gen.params?.height && !gen.params?.aspectRatio) {
        input.height = gen.params.height;
      }

      // Steps
      if (gen.params?.steps) {
        const stepsParam = schemaHasParam([
          "num_inference_steps",
          "steps",
          "num_steps",
          "inference_steps",
          "sampling_steps",
        ]);
        if (stepsParam) {
          input[stepsParam] = gen.params.steps;
        }
      }

      // Guidance
      if (gen.params?.guidanceScale) {
        const guidanceParam = schemaHasParam([
          "guidance_scale",
          "guidance",
          "cfg_scale",
          "classifier_free_guidance",
        ]);
        if (guidanceParam) {
          input[guidanceParam] = gen.params.guidanceScale;
        }
      }

      input.seed = seed;

      // Negative prompt
      if (gen.params?.negativePrompt?.trim()) {
        const negParam = schemaHasParam([
          "negative_prompt",
          "negative",
          "neg_prompt",
        ]);
        if (negParam) {
          input[negParam] = gen.params.negativePrompt;
        }
      }

      // Count
      if (gen.params?.count && gen.params.count >= 1 && gen.params.count <= 4) {
        const countParam = schemaHasParam([
          "num_outputs",
          "batch_size",
          "num_images",
        ]);
        if (countParam) {
          input[countParam] = gen.params.count;
        }
      }

      // Quality
      if (gen.params?.quality) {
        const qualityParam = schemaHasParam(["quality"]);
        if (qualityParam) {
          input[qualityParam] = gen.params.quality;
        }
      }

      // Safety checker
      if (inputProps && "disable_safety_checker" in inputProps) {
        input.disable_safety_checker = true;
      }

      // Create prediction
      const prediction = await replicate.predictions.create({
        version: latestVersion,
        input,
        webhook: process.env.CONVEX_SITE_URL
          ? `${process.env.CONVEX_SITE_URL}/webhooks/replicate`
          : undefined,
        webhook_events_filter: ["start", "completed"],
      });

      // Update generation with replicate ID
      await ctx.runMutation(internal.generations.updateGenerationStatus, {
        id: args.generationId,
        status: prediction.status,
        replicateId: prediction.id,
      });

      // Update params with actual seed used
      if (seed !== gen.params?.seed) {
        await ctx.runMutation(internal.generations.patchGenerationParams, {
          id: args.generationId,
          seed,
        });
      }

      // Start polling
      await scheduleRunAfter(
        ctx,
        2000,
        internal.generations.pollCanvasGeneration,
        {
          generationId: args.generationId,
          predictionId: prediction.id,
          userId: args.userId,
          maxAttempts: 60,
          attempt: 1,
        }
      );
    } catch (error) {
      const friendlyError = getUserFriendlyErrorMessage(error);
      await ctx.runMutation(internal.generations.updateGenerationStatus, {
        id: args.generationId,
        status: "failed",
        error: friendlyError,
      });
    }
  },
});

// Patch seed onto generation params after creation
export const patchGenerationParams = internalMutation({
  args: {
    id: v.id("generations"),
    seed: v.number(),
  },
  handler: async (ctx, args) => {
    const gen = await ctx.db.get(args.id);
    if (!gen) {
      return;
    }
    await ctx.db.patch(args.id, {
      params: { ...gen.params, seed: args.seed },
    });
  },
});

// Internal query for actions
export const internalGetGeneration = internalQuery({
  args: { id: v.id("generations") },
  handler: (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const pollCanvasGeneration = internalAction({
  args: {
    generationId: v.id("generations"),
    predictionId: v.string(),
    userId: v.id("users"),
    maxAttempts: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.attempt > args.maxAttempts) {
      await ctx.runMutation(internal.generations.updateGenerationStatus, {
        id: args.generationId,
        status: "failed",
        error: getUserFriendlyErrorMessage(new Error("Generation timed out")),
      });
      return;
    }

    try {
      // Check if already completed (e.g., by webhook)
      const gen = await ctx.runQuery(
        internal.generations.internalGetGeneration,
        { id: args.generationId }
      );
      if (!gen) {
        return;
      }
      if (
        gen.status === "succeeded" ||
        gen.status === "failed" ||
        gen.status === "canceled"
      ) {
        return;
      }
      // Check if a retry replaced this prediction
      if (gen.replicateId !== args.predictionId) {
        return;
      }

      // Get API key
      const apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        undefined,
        args.userId
      );
      const replicate = new Replicate({ auth: apiKey });
      const prediction = await replicate.predictions.get(args.predictionId);

      if (prediction.status === "succeeded") {
        await ctx.runMutation(internal.generations.updateGenerationStatus, {
          id: args.generationId,
          status: "succeeded",
          duration: prediction.metrics?.predict_time,
          completedAt: Date.now(),
        });

        // Store images
        if (prediction.output) {
          const imageUrls = Array.isArray(prediction.output)
            ? prediction.output
            : [prediction.output];
          if (imageUrls.length > 0) {
            await scheduleRunAfter(
              ctx,
              0,
              internal.generations.storeCanvasImages,
              {
                generationId: args.generationId,
                imageUrls,
              }
            );
          }
        }
        return;
      }

      if (prediction.status === "failed") {
        const errorMessage = prediction.error
          ? getUserFriendlyErrorMessage(new Error(String(prediction.error)))
          : "Generation failed";
        await ctx.runMutation(internal.generations.updateGenerationStatus, {
          id: args.generationId,
          status: "failed",
          error: errorMessage,
        });
        return;
      }

      if (prediction.status === "canceled") {
        await ctx.runMutation(internal.generations.updateGenerationStatus, {
          id: args.generationId,
          status: "canceled",
        });
        return;
      }

      // Continue polling
      const nextDelay = args.attempt <= 3 ? 2000 : 5000;
      await scheduleRunAfter(
        ctx,
        nextDelay,
        internal.generations.pollCanvasGeneration,
        { ...args, attempt: args.attempt + 1 }
      );
    } catch {
      if (args.attempt < args.maxAttempts) {
        const retryDelay = Math.min(10000, 2000 * 2 ** (args.attempt - 1));
        await scheduleRunAfter(
          ctx,
          retryDelay,
          internal.generations.pollCanvasGeneration,
          { ...args, attempt: args.attempt + 1 }
        );
      } else {
        await ctx.runMutation(internal.generations.updateGenerationStatus, {
          id: args.generationId,
          status: "failed",
          error: getUserFriendlyErrorMessage(
            new Error("Failed to check generation status")
          ),
        });
      }
    }
  },
});

export const storeCanvasImages = internalAction({
  args: {
    generationId: v.id("generations"),
    imageUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already stored
    const gen = await ctx.runQuery(internal.generations.internalGetGeneration, {
      id: args.generationId,
    });
    if (gen?.storageIds && gen.storageIds.length > 0) {
      return;
    }

    const storageIds: Id<"_storage">[] = [];

    for (const imageUrl of args.imageUrls) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          continue;
        }

        const imageBuffer = await response.arrayBuffer();
        const contentType =
          response.headers.get("content-type") || "image/jpeg";
        const blob = new globalThis.Blob([imageBuffer], { type: contentType });
        const storageId = await ctx.storage.store(blob);
        storageIds.push(storageId);
      } catch (err) {
        console.error("Failed to store canvas image", {
          generationId: args.generationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (storageIds.length > 0) {
      await ctx.runMutation(internal.generations.storeGenerationImages, {
        id: args.generationId,
        storageIds,
      });
    }
  },
});

// Webhook handler for canvas generations
export const handleCanvasWebhook = internalAction({
  args: {
    predictionId: v.string(),
    status: v.string(),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const gen = await ctx.runQuery(internal.generations.getByReplicateId, {
      replicateId: args.predictionId,
    });
    if (!gen) {
      return;
    }

    await ctx.runMutation(internal.generations.updateGenerationStatus, {
      id: gen._id,
      status: args.status,
      error: args.error,
      duration: args.metadata?.predict_time,
      completedAt:
        args.status === "succeeded" || args.status === "failed"
          ? Date.now()
          : undefined,
    });

    if (args.status === "succeeded" && args.output) {
      const imageUrls = Array.isArray(args.output)
        ? args.output
        : [args.output];
      if (imageUrls.length > 0) {
        await scheduleRunAfter(ctx, 0, internal.generations.storeCanvasImages, {
          generationId: gen._id,
          imageUrls,
        });
      }
    }
  },
});
