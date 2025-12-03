import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  ConvexProvider as ConvexClientProvider,
  ConvexReactClient,
} from "convex/react";
import React from "react";

type ConvexProviderProps = {
  children: React.ReactNode;
};

// Create a singleton client instance that persists across renders
let clientInstance: ConvexReactClient | null = null;

function getOrCreateClient(): ConvexReactClient {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!clientInstance) {
    if (!convexUrl) {
      throw new Error("VITE_CONVEX_URL environment variable is not set");
    }
    // Handle server disconnection errors for better network resilience (Convex v1.25+)
    clientInstance = new ConvexReactClient(convexUrl, {
      onServerDisconnectError: (message: string) => {
        console.error("[Convex] Server disconnect:", message);
      },
    });
  }

  return clientInstance;
}

// Clear old anonymous session tokens when returning from OAuth
// This prevents "Invalid refresh token" errors when the old session
// tries to refresh after being invalidated server-side
function clearOAuthTokens() {
  if (typeof window === "undefined") {
    return;
  }

  const oauthFlowActive = sessionStorage.getItem("polly:oauth-flow-active");

  if (oauthFlowActive === "true") {
    const convexUrl = import.meta.env.VITE_CONVEX_URL;

    if (convexUrl) {
      // Clear ONLY the old session tokens (JWT and refresh token)
      // DO NOT clear the OAuth verifier - it's needed to complete the current OAuth flow
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("__convexAuthJWT") ||
            key.startsWith("__convexAuthRefreshToken"))
        ) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    }
    // Clear the flag
    sessionStorage.removeItem("polly:oauth-flow-active");
  }
}

// Run immediately at module load
clearOAuthTokens();

export const ConvexProvider = ({ children }: ConvexProviderProps) => {
  // Also run when component mounts (in case module was already loaded)
  React.useEffect(() => {
    clearOAuthTokens();
  }, []);

  const client = getOrCreateClient();

  return (
    <ConvexClientProvider client={client}>
      <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>
    </ConvexClientProvider>
  );
};

export function getConvexClient() {
  return getOrCreateClient();
}
