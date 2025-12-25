import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

/**
 * Returns all available image models (user + built-in).
 * Built-in models have `isBuiltIn: true` and `free: boolean`.
 */
export function useEnabledImageModels() {
  const availableImageModels = useQuery(
    api.imageModels.getAvailableImageModels
  );
  return Array.isArray(availableImageModels) ? availableImageModels : undefined;
}
