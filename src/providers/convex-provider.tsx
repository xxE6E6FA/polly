import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAnonymousSession,
  fetchAnonymousToken,
  getAnonymousSession,
  isSessionExpired,
  refreshAnonymousToken,
  setAnonymousSession,
} from "@/lib";
import { CACHE_KEYS, set } from "@/lib/local-storage";

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
    clientInstance = new ConvexReactClient(convexUrl, {
      onServerDisconnectError: (message: string) => {
        console.error("[Convex] Server disconnect:", message);
      },
    });
  }

  return clientInstance;
}

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY environment variable is not set");
}

/**
 * Derive the Convex site URL from the Convex deployment URL.
 * VITE_CONVEX_URL is like https://foo-bar-123.convex.cloud
 * Site URL is         like https://foo-bar-123.convex.site
 */
function getConvexSiteUrl(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  return convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
}

/**
 * Custom useAuth hook that wraps Clerk's useAuth with anonymous JWT support.
 *
 * When a user is signed in via Clerk, this passes through Clerk's auth
 * unchanged. When the user is NOT signed in via Clerk, it fetches an
 * anonymous JWT from the Convex HTTP endpoint and provides it to
 * ConvexProviderWithClerk so the user appears authenticated to Convex.
 */
function useAuthWithAnonymous() {
  const clerkAuth = useAuth();
  const [anonReady, setAnonReady] = useState(false);
  const [anonToken, setAnonToken] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const siteUrl = getConvexSiteUrl();

  // Schedule a token refresh before expiry
  const scheduleRefresh = useCallback(
    (expiresAt: number) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      const refreshIn = Math.max(0, expiresAt - Date.now() - 5 * 60 * 1000);
      refreshTimerRef.current = setTimeout(async () => {
        const session = getAnonymousSession();
        if (!session) {
          return;
        }
        try {
          const newSession = await refreshAnonymousToken(siteUrl, session);
          setAnonToken(newSession.token);
          scheduleRefresh(newSession.expiresAt);
        } catch (err) {
          console.error("[AnonAuth] Refresh failed:", err);
        }
      }, refreshIn);
    },
    [siteUrl]
  );

  useEffect(() => {
    // Clerk is signed in — clear anonymous session and skip
    if (clerkAuth.isSignedIn) {
      const existingSession = getAnonymousSession();
      if (existingSession) {
        // Stash the anonymous token + ID for graduation after ensureUser
        set(CACHE_KEYS.anonymousGraduationToken, existingSession.token);
        set(CACHE_KEYS.anonymousUserGraduation, existingSession.externalId);
        clearAnonymousSession();
      }
      setAnonReady(false);
      setAnonToken(null);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      return;
    }

    // Clerk is not loaded yet — wait
    if (!clerkAuth.isLoaded) {
      return;
    }

    // Clerk is loaded and NOT signed in — set up anonymous auth
    if (fetchingRef.current) {
      return;
    }

    const initAnonymousAuth = async () => {
      fetchingRef.current = true;
      try {
        let session = getAnonymousSession();

        if (session && !isSessionExpired(session)) {
          setAnonToken(session.token);
          setAnonReady(true);
          scheduleRefresh(session.expiresAt);
          return;
        }

        if (session && isSessionExpired(session)) {
          try {
            session = await refreshAnonymousToken(siteUrl, session);
            setAnonToken(session.token);
            setAnonReady(true);
            scheduleRefresh(session.expiresAt);
            return;
          } catch {
            // Refresh failed — will fetch a new token below
          }
        }

        session = await fetchAnonymousToken(siteUrl);
        setAnonToken(session.token);
        setAnonReady(true);
        scheduleRefresh(session.expiresAt);
      } catch (err) {
        console.error("[AnonAuth] Failed to initialize:", err);
        // Still mark as ready so the app can render (will be unauthenticated)
        setAnonReady(true);
      } finally {
        fetchingRef.current = false;
      }
    };

    initAnonymousAuth();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [clerkAuth.isSignedIn, clerkAuth.isLoaded, siteUrl, scheduleRefresh]);

  // Clerk is signed in — pass through Clerk's auth directly
  if (clerkAuth.isSignedIn) {
    return clerkAuth;
  }

  // Clerk is loaded but not signed in — use anonymous auth
  if (clerkAuth.isLoaded && anonReady && anonToken) {
    return {
      isLoaded: true,
      isSignedIn: true as const,
      getToken: async () => {
        // Check if current token needs refresh
        const session = getAnonymousSession();
        if (session && isSessionExpired(session)) {
          try {
            const newSession = await refreshAnonymousToken(siteUrl, session);
            setAnonToken(newSession.token);
            setAnonymousSession(newSession);
            scheduleRefresh(newSession.expiresAt);
            return newSession.token;
          } catch {
            // Return existing token and hope for the best
          }
        }
        return anonToken;
      },
      signOut: clerkAuth.signOut,
      // Use a distinct orgId to force ConvexProviderWithClerk to recreate
      // its fetchAccessToken callback (which has [orgId, orgRole] as deps).
      // Without this, fetchAccessToken captures the stale clerkAuth.getToken
      // from the loading phase instead of our anonymous getToken.
      orgId: "anonymous",
      orgRole: clerkAuth.orgRole,
      orgSlug: clerkAuth.orgSlug,
      userId: null,
      sessionId: null,
      actor: null,
      orgPermissions: undefined,
    };
  }

  // Still loading
  return {
    ...clerkAuth,
    isLoaded: false,
  };
}

export const ConvexProvider = ({ children }: ConvexProviderProps) => {
  const client = getOrCreateClient();

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl="/auth"
      afterSignOutUrl="/"
    >
      <ConvexProviderWithClerk client={client} useAuth={useAuthWithAnonymous}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};

export function getConvexClient() {
  return getOrCreateClient();
}
