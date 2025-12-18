/**
 * Convex queries for model capability resolution.
 *
 * This module exposes the capability resolver as a query so it can be
 * called from actions (which don't have direct db access).
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveModelCapabilities } from "./lib/capability_resolver";

/**
 * Resolve model capabilities using the unified resolution system.
 *
 * Resolution priority:
 * 1. models.dev cache (primary source, updated daily)
 * 2. Pattern matching fallback (for models not in cache)
 *
 * This query is primarily used by actions that need capability info
 * but don't have direct db access.
 */
export const resolveCapabilities = query({
  args: {
    provider: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    return await resolveModelCapabilities(ctx, args.provider, args.modelId);
  },
});

/**
 * Get capabilities for multiple models in a single query.
 * More efficient than calling resolveCapabilities multiple times.
 */
export const resolveCapabilitiesBatch = query({
  args: {
    models: v.array(
      v.object({
        provider: v.string(),
        modelId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.models.map(async ({ provider, modelId }) => {
        const capabilities = await resolveModelCapabilities(
          ctx,
          provider,
          modelId
        );
        return { provider, modelId, ...capabilities };
      })
    );
    return results;
  },
});
