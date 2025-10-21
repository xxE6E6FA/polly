import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type React from "react";

type ConvexProviderProps = {
  children: React.ReactNode;
};

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

export const ConvexProvider = ({ children }: ConvexProviderProps) => {
  const client = getOrCreateClient();

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
};

export function getConvexClient() {
  return getOrCreateClient();
}
