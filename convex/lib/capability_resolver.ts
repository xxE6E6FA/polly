/**
 * Unified capability resolution for AI models.
 *
 * Resolves model capabilities from models.dev cache (synced daily).
 * Returns conservative defaults for unknown models.
 */

import type { QueryCtx } from "../_generated/server";

// ============================================================================
// TYPES
// ============================================================================

export type ResolvedCapabilities = {
  supportsTools: boolean;
  supportsImages: boolean;
  supportsReasoning: boolean;
  supportsTemperature: boolean;
  supportsFiles: boolean;
  contextLength: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  source: "models.dev" | "unknown";
};

// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Resolve model capabilities from models.dev cache.
 * Returns conservative defaults for models not in cache.
 *
 * @param ctx - Convex query context
 * @param provider - Provider ID (e.g., "google", "openai", "anthropic")
 * @param modelId - Model identifier (e.g., "gemini-2.5-flash", "gpt-4o")
 * @returns Resolved capabilities with source indicator
 */
export async function resolveModelCapabilities(
  ctx: QueryCtx,
  provider: string,
  modelId: string
): Promise<ResolvedCapabilities> {
  try {
    const cachedModel = await ctx.db
      .query("modelsDevCache")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", provider).eq("modelId", modelId)
      )
      .unique();

    if (cachedModel) {
      return {
        supportsTools: cachedModel.supportsTools,
        supportsImages: cachedModel.inputModalities.includes("image"),
        supportsReasoning: cachedModel.supportsReasoning,
        supportsTemperature: cachedModel.supportsTemperature ?? true,
        supportsFiles:
          cachedModel.supportsAttachments ??
          cachedModel.inputModalities.includes("file"),
        contextLength: cachedModel.contextWindow,
        maxOutputTokens: cachedModel.maxOutputTokens,
        inputModalities: cachedModel.inputModalities,
        source: "models.dev",
      };
    }
  } catch {
    // Cache query failed (e.g., in tests with mocked db)
  }

  // Model not in cache - return conservative defaults
  return {
    supportsTools: false,
    supportsImages: false,
    supportsReasoning: false,
    supportsTemperature: true,
    supportsFiles: false,
    contextLength: 4096,
    inputModalities: ["text"],
    source: "unknown",
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR HYDRATING MODELS
// ============================================================================

/**
 * Minimal model reference required for hydration.
 */
export type ModelReference = {
  modelId: string;
  provider: string;
  name: string;
};

/**
 * Model with resolved capabilities.
 */
export type HydratedModel<T extends ModelReference> = T & {
  supportsTools: boolean;
  supportsImages: boolean;
  supportsReasoning: boolean;
  supportsTemperature: boolean;
  supportsFiles: boolean;
  contextLength: number;
  maxOutputTokens?: number;
  inputModalities: string[];
};

/**
 * Hydrate a model reference with capabilities from models.dev cache.
 *
 * @param ctx - Convex query context
 * @param model - Model reference with modelId, provider, name
 * @returns Model with resolved capabilities
 */
export async function hydrateModelWithCapabilities<T extends ModelReference>(
  ctx: QueryCtx,
  model: T
): Promise<HydratedModel<T>> {
  const capabilities = await resolveModelCapabilities(
    ctx,
    model.provider,
    model.modelId
  );

  return {
    ...model,
    supportsTools: capabilities.supportsTools,
    supportsImages: capabilities.supportsImages,
    supportsReasoning: capabilities.supportsReasoning,
    supportsTemperature: capabilities.supportsTemperature,
    supportsFiles: capabilities.supportsFiles,
    contextLength: capabilities.contextLength,
    maxOutputTokens: capabilities.maxOutputTokens,
    inputModalities: capabilities.inputModalities,
  };
}

/**
 * Hydrate multiple models with capabilities in parallel.
 *
 * @param ctx - Convex query context
 * @param models - Array of model references
 * @returns Array of models with resolved capabilities
 */
export async function hydrateModelsWithCapabilities<T extends ModelReference>(
  ctx: QueryCtx,
  models: T[]
): Promise<HydratedModel<T>[]> {
  return Promise.all(
    models.map((model) => hydrateModelWithCapabilities(ctx, model))
  );
}
