import React from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

interface ConvexProviderProps {
  children: React.ReactNode;
}

// Create a singleton client instance that persists across renders
let clientInstance: ConvexReactClient | null = null;

function getOrCreateClient(): ConvexReactClient {
  if (!clientInstance) {
    const url = import.meta.env.VITE_CONVEX_URL;

    if (!url) {
      throw new Error("VITE_CONVEX_URL is not set");
    }

    clientInstance = new ConvexReactClient(url);
  }

  return clientInstance;
}

export function ConvexProvider({ children }: ConvexProviderProps) {
  const client = getOrCreateClient();

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
