import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "react-router";

import { clearUserCache } from "@/lib/user-cache";
import { useEventDispatcher } from "./use-convex-cache";

export function useAuthWithCache() {
  const originalAuthActions = useAuthActions();
  const navigate = useNavigate();
  const { dispatch } = useEventDispatcher();

  return {
    ...originalAuthActions,
    signOut: async () => {
      // Clear user cache and trigger conversation cache invalidation
      clearUserCache();
      dispatch("user-graduated");

      // Then perform the actual sign out
      await originalAuthActions.signOut();

      // Redirect to home page after signing out
      navigate("/");
    },
  };
}
