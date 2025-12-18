import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import {
  getPollyProvider,
  POLLY_TO_MODELSDEV_PROVIDER,
  SUPPORTED_PROVIDERS,
} from "./lib/models_dev_mapping";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw model data from models.dev API
 */
type ModelsDevRawModel = {
  id: string;
  name: string;
  family?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  temperature?: boolean;
  structured_output?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  cost?: {
    input?: number;
    output?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  knowledge?: string;
  release_date?: string;
};

/**
 * Raw provider data from models.dev API
 */
type ModelsDevProviderData = {
  id: string;
  name: string;
  models: Record<string, ModelsDevRawModel>;
};

// ============================================================================
// INTERNAL MUTATIONS
// ============================================================================

/**
 * Upsert a single model into the cache
 */
export const upsertModel = internalMutation({
  args: {
    provider: v.string(),
    modelId: v.string(),
    name: v.string(),
    supportsTools: v.boolean(),
    supportsReasoning: v.boolean(),
    supportsAttachments: v.optional(v.boolean()),
    supportsTemperature: v.optional(v.boolean()),
    supportsStructuredOutput: v.optional(v.boolean()),
    inputModalities: v.array(v.string()),
    contextWindow: v.number(),
    maxOutputTokens: v.optional(v.number()),
    pricing: v.optional(
      v.object({
        input: v.optional(v.number()),
        output: v.optional(v.number()),
      })
    ),
    knowledgeCutoff: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if model already exists
    const existing = await ctx.db
      .query("modelsDevCache")
      .withIndex("by_provider_model", q =>
        q.eq("provider", args.provider).eq("modelId", args.modelId)
      )
      .unique();

    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        name: args.name,
        supportsTools: args.supportsTools,
        supportsReasoning: args.supportsReasoning,
        supportsAttachments: args.supportsAttachments,
        supportsTemperature: args.supportsTemperature,
        supportsStructuredOutput: args.supportsStructuredOutput,
        inputModalities: args.inputModalities,
        contextWindow: args.contextWindow,
        maxOutputTokens: args.maxOutputTokens,
        pricing: args.pricing,
        knowledgeCutoff: args.knowledgeCutoff,
        releaseDate: args.releaseDate,
        lastFetched: now,
      });
      return { inserted: false, updated: true };
    }

    // Insert new entry
    await ctx.db.insert("modelsDevCache", {
      ...args,
      lastFetched: now,
      createdAt: now,
    });
    return { inserted: true, updated: false };
  },
});

/**
 * Clean up stale cache entries (older than specified days)
 */
export const cleanupStaleEntries = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysOld = args.olderThanDays ?? 7;
    const batchSize = args.batchSize ?? 100;
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const staleEntries = await ctx.db
      .query("modelsDevCache")
      .withIndex("by_last_fetched", q => q.lt("lastFetched", cutoff))
      .take(batchSize);

    let deleted = 0;
    for (const entry of staleEntries) {
      await ctx.db.delete(entry._id);
      deleted++;
    }

    return { deleted, hasMore: staleEntries.length === batchSize };
  },
});

// ============================================================================
// INTERNAL ACTIONS
// ============================================================================

/**
 * Full API response from models.dev - providers keyed by ID
 */
type ModelsDevApiResponse = Record<string, ModelsDevProviderData>;

// Cache the API response to avoid multiple fetches in a single sync
let cachedApiData: ModelsDevApiResponse | null = null;

/**
 * Fetch all models from models.dev API (single endpoint)
 */
async function fetchModelsDevApi(): Promise<ModelsDevApiResponse | null> {
  if (cachedApiData) {
    return cachedApiData;
  }

  try {
    const response = await fetch("https://models.dev/api.json");

    if (!response.ok) {
      console.error(`Failed to fetch models.dev API: ${response.status}`);
      return null;
    }

    cachedApiData = (await response.json()) as ModelsDevApiResponse;
    return cachedApiData;
  } catch (error) {
    console.error("Error fetching models.dev API:", error);
    return null;
  }
}

/**
 * Get provider data from the cached API response
 */
async function fetchModelsDevProvider(
  modelsDevProviderId: string
): Promise<ModelsDevProviderData | null> {
  const apiData = await fetchModelsDevApi();
  if (!apiData) {
    return null;
  }

  const providerData = apiData[modelsDevProviderId];
  if (!providerData) {
    console.warn(`Provider ${modelsDevProviderId} not found in models.dev API`);
    return null;
  }

  return providerData;
}

/**
 * Sync models.dev cache for all supported providers
 * Called by cron job daily
 */
export const syncModelsDevCache = internalAction({
  args: {
    providers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Clear cache from previous runs
    cachedApiData = null;

    // Default to all supported providers
    const pollyProviders = args.providers ?? SUPPORTED_PROVIDERS;

    let synced = 0;
    let errors = 0;
    const providerStats: Record<string, { synced: number; errors: number }> =
      {};

    for (const pollyProvider of pollyProviders) {
      const modelsDevProviderIds =
        POLLY_TO_MODELSDEV_PROVIDER[pollyProvider] ?? [];

      providerStats[pollyProvider] = { synced: 0, errors: 0 };

      for (const modelsDevProviderId of modelsDevProviderIds) {
        const providerData = await fetchModelsDevProvider(modelsDevProviderId);

        if (!providerData?.models) {
          continue;
        }

        // Process each model
        for (const [modelKey, model] of Object.entries(providerData.models)) {
          try {
            // Map models.dev provider back to Polly provider
            const mappedProvider = getPollyProvider(providerData.id);
            if (!mappedProvider) {
              continue;
            }

            // Use the model.id if available, otherwise use the key
            const modelId = model.id || modelKey;

            await ctx.runMutation(internal.models_dev_sync.upsertModel, {
              provider: mappedProvider,
              modelId,
              name: model.name || modelId,
              supportsTools: model.tool_call ?? false,
              supportsReasoning: model.reasoning ?? false,
              supportsAttachments: model.attachment,
              supportsTemperature: model.temperature,
              supportsStructuredOutput: model.structured_output,
              inputModalities: model.modalities?.input ?? ["text"],
              contextWindow: model.limit?.context ?? 4096,
              maxOutputTokens: model.limit?.output,
              pricing:
                model.cost?.input !== undefined ||
                model.cost?.output !== undefined
                  ? { input: model.cost?.input, output: model.cost?.output }
                  : undefined,
              knowledgeCutoff: model.knowledge,
              releaseDate: model.release_date,
            });

            synced++;
            providerStats[pollyProvider].synced++;
          } catch (error) {
            errors++;
            providerStats[pollyProvider].errors++;
            console.error(`Failed to sync model ${modelKey}:`, error);
          }
        }
      }
    }

    // Clean up stale entries after syncing
    const cleanup: { deleted: number; hasMore: boolean } =
      await ctx.runMutation(internal.models_dev_sync.cleanupStaleEntries, {
        olderThanDays: 7,
      });

    return {
      synced,
      errors,
      providerStats,
      cleanup,
    };
  },
});
