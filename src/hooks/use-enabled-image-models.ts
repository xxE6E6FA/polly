import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

/**
 * Returns all available image models (user + built-in).
 * Built-in models have `isBuiltIn: true` and `free: boolean`.
 */
export function useEnabledImageModels() {
  const { isAuthenticated } = useConvexAuth();

  // Skip until auth is ready to avoid pre-auth results (built-in only)
  // overwriting the cache before the user's full model list arrives.
  const availableImageModels = useQuery(
    api.imageModels.getAvailableImageModels,
    isAuthenticated ? {} : "skip"
  );
  return Array.isArray(availableImageModels) ? availableImageModels : undefined;
}
