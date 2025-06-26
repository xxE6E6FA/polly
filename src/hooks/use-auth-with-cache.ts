import { useNavigate } from "react-router-dom";

import { useAuthActions } from "@convex-dev/auth/react";

import { clearConversationCache } from "../lib/conversation-cache";
import { clearUserCache } from "../lib/user-cache";

export function useAuthWithCache() {
  const originalAuthActions = useAuthActions();
  const navigate = useNavigate();

  return {
    ...originalAuthActions,
    signOut: async () => {
      // Clear all caches before signing out
      clearUserCache();
      clearConversationCache();

      // Then perform the actual sign out
      await originalAuthActions.signOut();

      // Redirect to home page after signing out
      navigate("/");
    },
  };
}
