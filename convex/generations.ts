import { paginationOptsValidator } from "convex/server";
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
import {
  convertAspectRatioToDimensions,
  detectImageInputFromSchema,
  findClosestAspectRatio,
  getAllowedAspectRatios,
  getImageInputConfig,
  isImageEditingModel,
} from "./ai/replicate_helpers";
import { getAuthUserId } from "./lib/auth";
import { scheduleRunAfter } from "./lib/scheduler";
import { replicateStatusValidator, type UpscaleEntryDoc } from "./lib/schemas";

/**
 * Parse allowed aspect ratios from a Replicate 422 error message.
 * Handles escaped quotes like: \"1:1\", \"3:2\" and regular "1:1", "3:2".
 */
function parseAllowedAspectRatios(errorMsg: string): string[] | null {
  if (!errorMsg.includes("aspect_ratio")) {
    return null;
  }
  // Match ratio patterns like 1:1, 3:2, 16:9 regardless of surrounding quotes
  const ratios = [...errorMsg.matchAll(/(\d+:\d+)/g)].map(m => m[1]!);

  // Dedupe
  const unique = [...new Set(ratios)];
  return unique.length > 0 ? unique : null;
}

// ============================================================================
// Helpers
// ============================================================================

type UpscaleEntryWithUrl = Omit<UpscaleEntryDoc, "storageId"> & {
  imageUrl?: string;
};

/**
 * Normalize legacy `upscale` field + new `upscales` array into a single
 * array with resolved image URLs.
 */
async function normalizeUpscales(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  gen: {
    upscale?: {
      status: "pending" | "starting" | "processing" | "succeeded" | "failed";
      replicateId?: string;
      storageId?: Id<"_storage">;
      error?: string;
      duration?: number;
      startedAt?: number;
      completedAt?: number;
    };
    upscales?: Array<{
      id: string;
      type: "standard" | "creative";
      status: "pending" | "starting" | "processing" | "succeeded" | "failed";
      replicateId?: string;
      storageId?: Id<"_storage">;
      error?: string;
      duration?: number;
      startedAt?: number;
      completedAt?: number;
    }>;
  }
): Promise<UpscaleEntryWithUrl[]> {
  const entries: UpscaleEntryWithUrl[] = [];

  // Legacy upscale field → synthesize as creative entry
  if (gen.upscale && !gen.upscales) {
    let imageUrl: string | undefined;
    if (gen.upscale.storageId) {
      imageUrl = (await ctx.storage.getUrl(gen.upscale.storageId)) ?? undefined;
    }
    entries.push({
      id: "legacy",
      type: "creative",
      status: gen.upscale.status,
      replicateId: gen.upscale.replicateId,
      error: gen.upscale.error,
      imageUrl,
      duration: gen.upscale.duration,
      startedAt: gen.upscale.startedAt,
      completedAt: gen.upscale.completedAt,
    });
  }

  // New upscales array — resolve URLs in parallel
  if (gen.upscales) {
    const resolved = await Promise.all(
      gen.upscales.map(async entry => {
        let imageUrl: string | undefined;
        if (entry.storageId) {
          imageUrl = (await ctx.storage.getUrl(entry.storageId)) ?? undefined;
        }
        return {
          id: entry.id,
          type: entry.type,
          status: entry.status,
          replicateId: entry.replicateId,
          error: entry.error,
          imageUrl,
          duration: entry.duration,
          startedAt: entry.startedAt,
          completedAt: entry.completedAt,
        } satisfies UpscaleEntryWithUrl;
      })
    );
    entries.push(...resolved);
  }

  return entries;
}

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

    // Resolve storage URLs for images (including upscales)
    const generations = await Promise.all(
      page.map(async gen => {
        let imageUrls: string[] = [];
        if (gen.storageIds) {
          const urls = await Promise.all(
            gen.storageIds.map(id => ctx.storage.getUrl(id))
          );
          imageUrls = urls.filter((u): u is string => u !== null);
        }
        // Normalize legacy upscale → upscales array
        const upscales = await normalizeUpscales(ctx, gen);

        // Count edit descendants for root images (no parentGenerationId)
        let editCount = 0;
        if (!gen.parentGenerationId) {
          const descendants = await ctx.db
            .query("generations")
            .withIndex("by_root", q => q.eq("rootGenerationId", gen._id))
            .collect();
          editCount = descendants.filter(d => !d.isArchived).length;
        }

        // Resolve reference image URLs
        let referenceImageUrls: string[] = [];
        if (gen.params?.referenceImageIds) {
          const urls = await Promise.all(
            gen.params.referenceImageIds.map(id => ctx.storage.getUrl(id))
          );
          referenceImageUrls = urls.filter((u): u is string => u !== null);
        }

        return { ...gen, imageUrls, upscales, editCount, referenceImageUrls };
      })
    );

    return {
      generations,
      continueCursor: hasMore ? page[page.length - 1]?._id : null,
    };
  },
});

export const listGenerationsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // No post-filtering — return all items to keep pagination cursors stable.
    // Client-side filtering handles filterMode to avoid cursor drift that
    // causes scroll jumps when pages reactively re-evaluate.
    const paginatedResult = await ctx.db
      .query("generations")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    // Resolve storage URLs, upscales, and edit counts in parallel
    const generations = await Promise.all(
      paginatedResult.page.map(async gen => {
        let imageUrls: string[] = [];
        if (gen.storageIds) {
          const urls = await Promise.all(
            gen.storageIds.map(id => ctx.storage.getUrl(id))
          );
          imageUrls = urls.filter((u): u is string => u !== null);
        }
        const upscales = await normalizeUpscales(ctx, gen);

        // Only count edit descendants for root images
        let editCount = 0;
        if (!gen.parentGenerationId) {
          const descendants = await ctx.db
            .query("generations")
            .withIndex("by_root", q => q.eq("rootGenerationId", gen._id))
            .collect();
          editCount = descendants.filter(d => !d.isArchived).length;
        }

        let referenceImageUrls: string[] = [];
        if (gen.params?.referenceImageIds) {
          const urls = await Promise.all(
            gen.params.referenceImageIds.map(id => ctx.storage.getUrl(id))
          );
          referenceImageUrls = urls.filter((u): u is string => u !== null);
        }

        return { ...gen, imageUrls, upscales, editCount, referenceImageUrls };
      })
    );

    return {
      ...paginatedResult,
      page: generations,
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
    const upscales = await normalizeUpscales(ctx, gen);
    return { ...gen, imageUrls, upscales };
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
        referenceImageIds: v.optional(v.array(v.id("_storage"))),
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

export const cancelGeneration = mutation({
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

    if (
      gen.status !== "pending" &&
      gen.status !== "starting" &&
      gen.status !== "processing"
    ) {
      return;
    }

    await ctx.db.patch(args.id, { status: "canceled" });

    if (gen.replicateId) {
      await scheduleRunAfter(
        ctx,
        0,
        internal.generations.cancelCanvasPrediction,
        { predictionId: gen.replicateId, userId }
      );
    }
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

    // Cancel active prediction if still running
    if (
      gen.replicateId &&
      (gen.status === "pending" ||
        gen.status === "starting" ||
        gen.status === "processing")
    ) {
      await scheduleRunAfter(
        ctx,
        0,
        internal.generations.cancelCanvasPrediction,
        { predictionId: gen.replicateId, userId }
      );
    }

    // Delete stored files
    if (gen.storageIds) {
      for (const storageId of gen.storageIds) {
        await ctx.storage.delete(storageId);
      }
    }
    // Clean up upscale storage
    for (const entry of gen.upscales ?? []) {
      if (entry.storageId) {
        await ctx.storage.delete(entry.storageId);
      }
    }
    if (gen.upscale?.storageId) {
      await ctx.storage.delete(gen.upscale.storageId);
    }
    await ctx.db.delete(args.id);
  },
});

export const archiveGeneration = mutation({
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
    await ctx.db.patch(args.id, { isArchived: true });
  },
});

export const unarchiveGeneration = mutation({
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
    await ctx.db.patch(args.id, { isArchived: false });
  },
});

export const archiveUpscaleEntry = mutation({
  args: {
    id: v.id("generations"),
    upscaleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }
    const upscales = (gen.upscales ?? []).map(e =>
      e.id === args.upscaleId ? { ...e, isArchived: true } : e
    );
    await ctx.db.patch(args.id, { upscales });
  },
});

export const unarchiveUpscaleEntry = mutation({
  args: {
    id: v.id("generations"),
    upscaleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }
    const upscales = (gen.upscales ?? []).map(e =>
      e.id === args.upscaleId ? { ...e, isArchived: false } : e
    );
    await ctx.db.patch(args.id, { upscales });
  },
});

export const retryGeneration = mutation({
  args: {
    id: v.id("generations"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }

    // Reset status and optionally switch model
    await ctx.db.patch(args.id, {
      status: "pending",
      error: undefined,
      replicateId: undefined,
      completedAt: undefined,
      duration: undefined,
      ...(args.model ? { model: args.model } : {}),
    });

    // Re-schedule the generation action
    await scheduleRunAfter(ctx, 0, internal.generations.runCanvasGeneration, {
      generationId: args.id,
      userId,
    });

    return args.id;
  },
});

// ============================================================================
// Actions
// ============================================================================

export const cancelCanvasPrediction = internalAction({
  args: {
    predictionId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        undefined,
        args.userId
      );
      const replicate = new Replicate({ auth: apiKey });
      await replicate.predictions.cancel(args.predictionId);
    } catch (error) {
      console.error(
        "[canvas-gen] Failed to cancel prediction:",
        error instanceof Error ? error.message : String(error)
      );
    }
  },
});

/** Fetch a remote image, store it in Convex storage, and return the storage ID. */
async function fetchAndStoreImage(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  imageUrl: string,
  defaultContentType = "image/jpeg"
): Promise<Id<"_storage">> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const contentType =
    response.headers.get("content-type") || defaultContentType;
  const buffer = await response.arrayBuffer();
  const blob = new globalThis.Blob([buffer], { type: contentType });
  return ctx.storage.store(blob);
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
        referenceImageIds: v.optional(v.array(v.id("_storage"))),
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

export const startEditGeneration = action({
  args: {
    prompt: v.string(),
    modelId: v.string(),
    parentGenerationId: v.id("generations"),
    params: v.optional(
      v.object({
        aspectRatio: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({ generationId: v.id("generations") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Fetch parent to get source image and lineage
    // biome-ignore lint/suspicious/noExplicitAny: Break circular type inference in Convex action
    const parent: any = await ctx.runQuery(
      internal.generations.internalGetGeneration,
      { id: args.parentGenerationId }
    );
    if (!parent || parent.userId !== userId) {
      throw new Error("Parent generation not found");
    }
    if (parent.status !== "succeeded") {
      throw new Error("Only succeeded images can be edited");
    }
    if (!parent.storageIds || parent.storageIds.length === 0) {
      throw new Error("No image to edit");
    }

    // Compute root: inherit from parent, or parent IS the root
    const rootGenerationId = parent.rootGenerationId ?? args.parentGenerationId;

    // Inherit aspect ratio from parent if not specified
    const aspectRatio = args.params?.aspectRatio ?? parent.params?.aspectRatio;

    // Use parent's storageIds as reference images
    const referenceImageIds = parent.storageIds;

    const generationId: Id<"generations"> = await ctx.runMutation(
      internal.generations.internalCreateGeneration,
      {
        userId,
        prompt: args.prompt,
        model: args.modelId,
        provider: "replicate",
        params: {
          aspectRatio,
          referenceImageIds,
        },
        parentGenerationId: args.parentGenerationId,
        rootGenerationId,
      }
    );

    // Schedule generation — reuses existing runner which handles referenceImageIds
    await scheduleRunAfter(ctx, 0, internal.generations.runCanvasGeneration, {
      generationId,
      userId,
    });

    return { generationId };
  },
});

export const getEditTree = query({
  args: { rootId: v.id("generations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Fetch root
    const root = await ctx.db.get(args.rootId);
    if (!root || root.userId !== userId) {
      return [];
    }

    // Fetch all descendants via by_root index
    const descendants = await ctx.db
      .query("generations")
      .withIndex("by_root", q => q.eq("rootGenerationId", args.rootId))
      .order("asc")
      .collect();

    // Combine root + descendants, exclude archived
    const all = [root, ...descendants].filter(g => !g.isArchived);
    return Promise.all(
      all.map(async gen => {
        let imageUrl: string | undefined;
        if (gen.storageIds && gen.storageIds.length > 0 && gen.storageIds[0]) {
          imageUrl = (await ctx.storage.getUrl(gen.storageIds[0])) ?? undefined;
        }
        return {
          _id: gen._id,
          prompt: gen.prompt,
          model: gen.model,
          status: gen.status,
          parentGenerationId: gen.parentGenerationId,
          rootGenerationId: gen.rootGenerationId,
          imageUrl,
          error: gen.error,
          createdAt: gen.createdAt,
          aspectRatio: gen.params?.aspectRatio,
        };
      })
    );
  },
});

export const getEditDescendantCount = query({
  args: { rootId: v.id("generations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }
    const descendants = await ctx.db
      .query("generations")
      .withIndex("by_root", q => q.eq("rootGenerationId", args.rootId))
      .collect();
    return descendants.filter(d => d.userId === userId && !d.isArchived).length;
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
        referenceImageIds: v.optional(v.array(v.id("_storage"))),
      })
    ),
    batchId: v.optional(v.string()),
    parentGenerationId: v.optional(v.id("generations")),
    rootGenerationId: v.optional(v.id("generations")),
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
      parentGenerationId: args.parentGenerationId,
      rootGenerationId: args.rootGenerationId,
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
          // Check if the model constrains aspect_ratio to specific enum values
          const allowed = getAllowedAspectRatios(modelData);
          if (allowed && !allowed.includes(gen.params.aspectRatio)) {
            input.aspect_ratio = findClosestAspectRatio(
              gen.params.aspectRatio,
              allowed
            );
          } else {
            input.aspect_ratio = gen.params.aspectRatio;
          }
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

      // Reference images (image-to-image)
      if (
        gen.params?.referenceImageIds &&
        gen.params.referenceImageIds.length > 0
      ) {
        // Detect image input parameter — mirror conversation-side logic:
        // 1. Try schema introspection
        // 2. Fall back to hardcoded config ONLY for known editing models
        const schemaDetected = detectImageInputFromSchema(modelData);
        const isEditing = isImageEditingModel(gen.model);
        const imageInputConfig =
          schemaDetected ?? (isEditing ? getImageInputConfig(gen.model) : null);

        if (imageInputConfig) {
          // Pass storage URLs directly to Replicate (avoids OOM from base64 encoding large images).
          // Replicate fetches the URL server-side — same pattern as the upscaler.
          const imageUrls: string[] = [];
          for (const storageId of gen.params.referenceImageIds) {
            const storageUrl = await ctx.storage.getUrl(storageId);
            if (!storageUrl) {
              continue;
            }
            imageUrls.push(storageUrl);
          }

          if (imageUrls.length > 0) {
            if (imageInputConfig.isMessage) {
              input[imageInputConfig.paramName] = [
                {
                  role: "user",
                  content: [
                    { type: "text", text: gen.prompt },
                    ...imageUrls.map(url => ({
                      type: "image_url",
                      image_url: { url },
                    })),
                  ],
                },
              ];
            } else {
              input[imageInputConfig.paramName] = imageInputConfig.isArray
                ? imageUrls
                : imageUrls[0];
            }
          }
        }
      }

      // Create prediction (with aspect ratio retry on 422)
      let prediction;
      try {
        prediction = await replicate.predictions.create({
          version: latestVersion,
          input,
          webhook: process.env.CONVEX_SITE_URL
            ? `${process.env.CONVEX_SITE_URL}/webhooks/replicate`
            : undefined,
          webhook_events_filter: ["start", "completed"],
        });
      } catch (predError: unknown) {
        // If aspect_ratio was rejected with 422, parse allowed values and retry
        const errorMsg =
          predError instanceof Error ? predError.message : String(predError);
        const errorStr = String(errorMsg ?? "");
        const allowed = parseAllowedAspectRatios(errorStr);
        if (allowed && input.aspect_ratio && gen.params?.aspectRatio) {
          input.aspect_ratio = findClosestAspectRatio(
            gen.params.aspectRatio,
            allowed
          );
          prediction = await replicate.predictions.create({
            version: latestVersion,
            input,
            webhook: process.env.CONVEX_SITE_URL
              ? `${process.env.CONVEX_SITE_URL}/webhooks/replicate`
              : undefined,
            webhook_events_filter: ["start", "completed"],
          });
        } else {
          throw predError;
        }
      }

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
      console.error(
        "[canvas-gen] ERROR:",
        error instanceof Error ? error.message : String(error)
      );
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
        const storageId = await fetchAndStoreImage(ctx, imageUrl);
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

// ============================================================================
// Upscale (multi-version)
// ============================================================================

/**
 * Push a new upscale entry onto the upscales array.
 * Idempotent: skips if entry with same id already exists.
 * Atomic guard: throws if any entry is already in-progress.
 */
export const addUpscaleEntry = internalMutation({
  args: {
    id: v.id("generations"),
    entry: v.object({
      id: v.string(),
      type: v.union(v.literal("standard"), v.literal("creative")),
      status: replicateStatusValidator,
      replicateId: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      error: v.optional(v.string()),
      duration: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const gen = await ctx.db.get(args.id);
    if (!gen) {
      return;
    }
    const existing = gen.upscales ?? [];

    // Idempotent: already added (OCC retry)
    if (existing.some(e => e.id === args.entry.id)) {
      return;
    }

    // Atomic guard: no concurrent upscales
    const isInProgress = (s: string) =>
      s === "pending" || s === "starting" || s === "processing";
    const hasInProgress = existing.some(e => isInProgress(e.status));
    if (hasInProgress) {
      throw new Error("An upscale is already in progress");
    }

    await ctx.db.patch(args.id, { upscales: [...existing, args.entry] });
  },
});

/** Find entry by id in upscales array and merge partial update. */
export const updateUpscaleEntry = internalMutation({
  args: {
    id: v.id("generations"),
    upscaleId: v.string(),
    update: v.object({
      status: v.optional(replicateStatusValidator),
      replicateId: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      error: v.optional(v.string()),
      duration: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const gen = await ctx.db.get(args.id);
    if (!gen?.upscales) {
      return;
    }
    const upscales = gen.upscales.map(entry => {
      if (entry.id !== args.upscaleId) {
        return entry;
      }
      const defined = Object.fromEntries(
        Object.entries(args.update).filter(([, val]) => val !== undefined)
      );
      return { ...entry, ...defined };
    });
    await ctx.db.patch(args.id, { upscales });
  },
});

/** Auth, delete storage, cancel prediction, filter out entry. */
export const removeUpscaleEntry = mutation({
  args: {
    id: v.id("generations"),
    upscaleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const gen = await ctx.db.get(args.id);
    if (!gen || gen.userId !== userId) {
      throw new Error("Not found");
    }

    const entry = gen.upscales?.find(e => e.id === args.upscaleId);
    if (!entry) {
      return;
    }

    // Delete stored upscaled image
    if (entry.storageId) {
      await ctx.storage.delete(entry.storageId);
    }

    // Cancel in-progress prediction
    const isInProgress =
      entry.status === "pending" ||
      entry.status === "starting" ||
      entry.status === "processing";
    if (isInProgress && entry.replicateId) {
      await scheduleRunAfter(
        ctx,
        0,
        internal.generations.cancelCanvasPrediction,
        { predictionId: entry.replicateId, userId }
      );
    }

    // Filter out entry
    const upscales = (gen.upscales ?? []).filter(e => e.id !== args.upscaleId);
    await ctx.db.patch(args.id, { upscales });
  },
});

export const upscaleImage = action({
  args: {
    generationId: v.id("generations"),
    type: v.union(v.literal("standard"), v.literal("creative")),
    creativity: v.optional(v.number()),
    resemblance: v.optional(v.number()),
    upscalePrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const source = await ctx.runQuery(
      internal.generations.internalGetGeneration,
      { id: args.generationId }
    );
    if (!source || source.userId !== userId) {
      throw new Error("Generation not found");
    }
    if (source.status !== "succeeded") {
      throw new Error("Only succeeded images can be upscaled");
    }
    if (!source.storageIds || source.storageIds.length === 0) {
      throw new Error("No image to upscale");
    }

    const sourceStorageId = source.storageIds[0];
    if (!sourceStorageId) {
      throw new Error("No image to upscale");
    }

    const upscaleId = crypto.randomUUID();

    await ctx.runMutation(internal.generations.addUpscaleEntry, {
      id: args.generationId,
      entry: {
        id: upscaleId,
        type: args.type,
        status: "pending",
        startedAt: Date.now(),
      },
    });

    await scheduleRunAfter(ctx, 0, internal.generations.runUpscaleGeneration, {
      generationId: args.generationId,
      upscaleId,
      type: args.type,
      sourceStorageId,
      userId,
      creativity: args.creativity,
      resemblance: args.resemblance,
      upscalePrompt: args.upscalePrompt,
    });
  },
});

export const runUpscaleGeneration = internalAction({
  args: {
    generationId: v.id("generations"),
    upscaleId: v.string(),
    type: v.union(v.literal("standard"), v.literal("creative")),
    sourceStorageId: v.id("_storage"),
    userId: v.id("users"),
    creativity: v.optional(v.number()),
    resemblance: v.optional(v.number()),
    upscalePrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        undefined,
        args.userId
      );
      const replicate = new Replicate({ auth: apiKey });

      const storageUrl = await ctx.storage.getUrl(args.sourceStorageId);
      if (!storageUrl) {
        throw new Error("Source image not found in storage");
      }

      let prediction;

      if (args.type === "standard") {
        // Real-ESRGAN — faithful upscale, no prompt
        prediction = await replicate.predictions.create({
          model: "nightmareai/real-esrgan",
          input: {
            image: storageUrl,
            scale: 2,
            face_enhance: false,
          },
        });
      } else {
        // Creative — Clarity Upscaler with conservative defaults
        const modelData = await replicate.models.get(
          "philz1337x",
          "clarity-upscaler"
        );
        const latestVersion = modelData.latest_version?.id;
        if (!latestVersion) {
          throw new Error("No version available for clarity-upscaler");
        }

        const qualityTags = "masterpiece, best quality, highres";
        const prompt = args.upscalePrompt
          ? `(${args.upscalePrompt}), ${qualityTags}`
          : qualityTags;

        prediction = await replicate.predictions.create({
          version: latestVersion,
          input: {
            image: storageUrl,
            scale_factor: 2,
            creativity: args.creativity ?? 0.3,
            resemblance: args.resemblance ?? 0.7,
            prompt,
            negative_prompt: "(worst quality, low quality, normal quality:2)",
            output_format: "png",
          },
        });
      }

      await ctx.runMutation(internal.generations.updateUpscaleEntry, {
        id: args.generationId,
        upscaleId: args.upscaleId,
        update: {
          status: prediction.status as "starting" | "processing",
          replicateId: prediction.id,
        },
      });

      await scheduleRunAfter(
        ctx,
        2000,
        internal.generations.pollUpscaleGeneration,
        {
          generationId: args.generationId,
          upscaleId: args.upscaleId,
          predictionId: prediction.id,
          userId: args.userId,
          maxAttempts: 120,
          attempt: 1,
        }
      );
    } catch (error) {
      console.error(
        "[canvas-upscale] ERROR:",
        error instanceof Error ? error.message : String(error)
      );
      const friendlyError = getUserFriendlyErrorMessage(error);
      await ctx.runMutation(internal.generations.updateUpscaleEntry, {
        id: args.generationId,
        upscaleId: args.upscaleId,
        update: { status: "failed", error: friendlyError },
      });
    }
  },
});

export const pollUpscaleGeneration = internalAction({
  args: {
    generationId: v.id("generations"),
    upscaleId: v.string(),
    predictionId: v.string(),
    userId: v.id("users"),
    maxAttempts: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.attempt > args.maxAttempts) {
      await ctx.runMutation(internal.generations.updateUpscaleEntry, {
        id: args.generationId,
        upscaleId: args.upscaleId,
        update: { status: "failed", error: "Upscale timed out" },
      });
      return;
    }

    try {
      const gen = await ctx.runQuery(
        internal.generations.internalGetGeneration,
        { id: args.generationId }
      );
      const entry = gen?.upscales?.find(e => e.id === args.upscaleId);
      if (!entry) {
        return;
      }
      if (entry.status === "succeeded" || entry.status === "failed") {
        return;
      }

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
        const outputUrl = Array.isArray(prediction.output)
          ? prediction.output[0]
          : prediction.output;

        if (outputUrl) {
          await scheduleRunAfter(
            ctx,
            0,
            internal.generations.storeUpscaledImage,
            {
              generationId: args.generationId,
              upscaleId: args.upscaleId,
              imageUrl: outputUrl,
              duration: prediction.metrics?.predict_time,
            }
          );
        } else {
          await ctx.runMutation(internal.generations.updateUpscaleEntry, {
            id: args.generationId,
            upscaleId: args.upscaleId,
            update: { status: "failed", error: "No output from upscale" },
          });
        }
        return;
      }

      if (prediction.status === "failed") {
        const errorMessage = prediction.error
          ? getUserFriendlyErrorMessage(new Error(String(prediction.error)))
          : "Upscale failed";
        await ctx.runMutation(internal.generations.updateUpscaleEntry, {
          id: args.generationId,
          upscaleId: args.upscaleId,
          update: { status: "failed", error: errorMessage },
        });
        return;
      }

      if (prediction.status === "canceled") {
        await ctx.runMutation(internal.generations.updateUpscaleEntry, {
          id: args.generationId,
          upscaleId: args.upscaleId,
          update: { status: "failed", error: "Upscale was canceled" },
        });
        return;
      }

      if (
        prediction.status === "processing" ||
        prediction.status === "starting"
      ) {
        await ctx.runMutation(internal.generations.updateUpscaleEntry, {
          id: args.generationId,
          upscaleId: args.upscaleId,
          update: { status: prediction.status },
        });
      }

      const nextDelay = args.attempt <= 3 ? 2000 : 5000;
      await scheduleRunAfter(
        ctx,
        nextDelay,
        internal.generations.pollUpscaleGeneration,
        { ...args, attempt: args.attempt + 1 }
      );
    } catch {
      if (args.attempt < args.maxAttempts) {
        const retryDelay = Math.min(10000, 2000 * 2 ** (args.attempt - 1));
        await scheduleRunAfter(
          ctx,
          retryDelay,
          internal.generations.pollUpscaleGeneration,
          { ...args, attempt: args.attempt + 1 }
        );
      } else {
        await ctx.runMutation(internal.generations.updateUpscaleEntry, {
          id: args.generationId,
          upscaleId: args.upscaleId,
          update: {
            status: "failed",
            error: "Failed to check upscale status",
          },
        });
      }
    }
  },
});

export const storeUpscaledImage = internalAction({
  args: {
    generationId: v.id("generations"),
    upscaleId: v.string(),
    imageUrl: v.string(),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      // Check if already stored
      const gen = await ctx.runQuery(
        internal.generations.internalGetGeneration,
        { id: args.generationId }
      );
      const entry = gen?.upscales?.find(e => e.id === args.upscaleId);
      if (entry?.storageId) {
        return;
      }

      const storageId = await fetchAndStoreImage(
        ctx,
        args.imageUrl,
        "image/png"
      );

      await ctx.runMutation(internal.generations.updateUpscaleEntry, {
        id: args.generationId,
        upscaleId: args.upscaleId,
        update: {
          status: "succeeded",
          storageId,
          duration: args.duration,
          completedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error(
        "[canvas-upscale] Failed to store upscaled image:",
        error instanceof Error ? error.message : String(error)
      );
      await ctx.runMutation(internal.generations.updateUpscaleEntry, {
        id: args.generationId,
        upscaleId: args.upscaleId,
        update: {
          status: "failed",
          error: "Failed to store upscaled image",
        },
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
