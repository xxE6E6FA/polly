import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

/**
 * Hook to fetch built-in image models available to all users.
 * These models are seeded from the system configuration.
 */
export function useBuiltInImageModels() {
  return useQuery(api.imageModels.getBuiltInImageModels);
}
