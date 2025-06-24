import { useAuthActions } from "@convex-dev/auth/react";
import { clearUserCache } from "../lib/user-cache";
import { clearConversationCache } from "../lib/conversation-cache";
import { useNavigate } from "react-router-dom";

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
