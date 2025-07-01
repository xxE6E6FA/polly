import { useMemo } from "react";

import { useUser } from "./use-user";
import { type UserId } from "@/types";

/**
 * Hook to get the user ID only for authenticated (non-anonymous) users.
 * Returns null for anonymous users or if no user is available.
 */
export function useAuthenticatedUserId(): UserId | null {
  const { user } = useUser();

  return useMemo(() => {
    // Only return user ID if user exists and is not anonymous
    if (user && !user.isAnonymous) {
      return user._id;
    }

    return null;
  }, [user]);
}
