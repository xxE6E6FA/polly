import { useMemo } from "react";
import { getStoredAnonymousUserId } from "@/lib/auth-utils";
import type { UserId } from "@/types";
import { useUser } from "./use-user";

/**
 * Hook to get the user ID for Convex queries.
 * Returns authenticated user ID if available, otherwise falls back to stored anonymous user ID.
 * Returns null if no user ID is available.
 */
export function useQueryUserId(): UserId | null {
  const { user } = useUser();

  return useMemo(() => {
    // Prefer authenticated user ID
    if (user?._id) {
      return user._id;
    }

    // If not authenticated, fall back to stored anonymous user ID
    if (!user) {
      return getStoredAnonymousUserId();
    }

    // User object exists but no ID (edge case)
    return null;
  }, [user]);
}
