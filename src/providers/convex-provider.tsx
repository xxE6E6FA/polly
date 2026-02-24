import {
  ClerkDegraded,
  ClerkFailed,
  ClerkProvider,
  useAuth,
} from "@clerk/clerk-react";
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
import { clearClerkCookies } from "@/lib/clerk-recovery";
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
 * Check whether Clerk session cookies exist. When they do, the user likely has
 * a Clerk session that is still being verified. We use this to delay anonymous
 * auth so it doesn't race with Clerk's session restoration — an anon→Clerk
 * transition changes `orgId`, which forces ConvexProviderWithClerk to call
 * `setAuth()`, pausing the WebSocket and causing a visible query gap (flicker).
 */
function hasClerkSessionCookies(): boolean {
  return document.cookie.split(";").some(c => {
    const name = c.trim().split("=")[0] ?? "";
    return name === "__client_uat" || name === "__session";
  });
}

// How long to wait for Clerk to restore a session before falling back to
// anonymous auth, when Clerk session cookies are present. Clerk session
// verification typically completes within 300-500ms of isLoaded; 1s is
// a comfortable buffer without penalising legitimate anonymous users who
// have stale cookies from a previous signed-in session.
const CLERK_SETTLE_DELAY_MS = 1_000;

// Grace period before declaring both auth methods failed.
const AUTH_FALLBACK_DELAY_MS = 3_000;

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
  const [bothFailed, setBothFailed] = useState(false);
  const fetchingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasSignedInRef = useRef(false);

  const siteUrl = getConvexSiteUrl();

  // Track Clerk sign-in state to detect stale sessions. When a user was
  // signed in but Clerk now reports not-signed-in while session cookies
  // still exist, the session is stale. Clear cookies so the next load
  // starts clean instead of looping on failed token refreshes.
  useEffect(() => {
    if (clerkAuth.isSignedIn) {
      wasSignedInRef.current = true;
      return;
    }
    if (
      clerkAuth.isLoaded &&
      !clerkAuth.isSignedIn &&
      wasSignedInRef.current &&
      hasClerkSessionCookies()
    ) {
      wasSignedInRef.current = false;
      clearClerkCookies();
    }
  }, [clerkAuth.isLoaded, clerkAuth.isSignedIn]);

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
          console.error("[AnonAuth] Refresh failed, fetching new token:", err);
          try {
            const newSession = await fetchAnonymousToken(siteUrl);
            setAnonToken(newSession.token);
            scheduleRefresh(newSession.expiresAt);
          } catch (fetchErr) {
            console.error("[AnonAuth] New token fetch also failed:", fetchErr);
            clearAnonymousSession();
            setAnonToken(null);
          }
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

    // Guard against StrictMode double-mount: if the effect cleanup runs while
    // initAnonymousAuth is in-flight (past the setTimeout but mid-await), the
    // async function's setState calls would target the unmounted instance.
    // The cancelled flag lets us bail out after each await point.
    let cancelled = false;

    const initAnonymousAuth = async () => {
      fetchingRef.current = true;
      try {
        let session = getAnonymousSession();

        if (session && !isSessionExpired(session)) {
          if (cancelled) {
            return;
          }
          setAnonToken(session.token);
          setAnonReady(true);
          scheduleRefresh(session.expiresAt);
          return;
        }

        if (session && isSessionExpired(session)) {
          try {
            session = await refreshAnonymousToken(siteUrl, session);
            if (cancelled) {
              return;
            }
            setAnonToken(session.token);
            setAnonReady(true);
            scheduleRefresh(session.expiresAt);
            return;
          } catch {
            // Refresh failed — will fetch a new token below
          }
        }

        if (cancelled) {
          return;
        }
        session = await fetchAnonymousToken(siteUrl);
        if (cancelled) {
          return;
        }
        setAnonToken(session.token);
        setAnonReady(true);
        scheduleRefresh(session.expiresAt);
      } catch (err) {
        console.error("[AnonAuth] Failed to initialize:", err);
        if (!cancelled) {
          // Still mark as ready so the app can render (will be unauthenticated)
          setAnonReady(true);
        }
      } finally {
        fetchingRef.current = false;
      }
    };

    // When Clerk session cookies exist, the user likely has a session being
    // verified. Delay anon auth to let Clerk settle first — if Clerk restores
    // the session, this effect's cleanup cancels the timer and anon auth never
    // starts. Without this delay, anon auth can win the race, causing an
    // orgId flip ("anonymous" → undefined) that forces Convex to re-auth and
    // briefly drop all query subscriptions.
    const hadClerkCookies = hasClerkSessionCookies();
    const delay = hadClerkCookies ? CLERK_SETTLE_DELAY_MS : 0;

    const anonTimer = setTimeout(() => {
      if (cancelled || fetchingRef.current) {
        return;
      }
      initAnonymousAuth().then(() => {
        // If we reached anonymous auth despite Clerk cookies being present,
        // those cookies are stale (Clerk loaded and didn't sign in). Clear
        // them so subsequent visits skip the settle delay entirely.
        if (hadClerkCookies) {
          clearClerkCookies();
        }
      });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(anonTimer);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [clerkAuth.isSignedIn, clerkAuth.isLoaded, siteUrl, scheduleRefresh]);

  // Detect genuinely-stuck state: both Clerk and anon resolved, neither succeeded.
  // Uses a delay to avoid flashing unauthenticated during normal Clerk token restore.
  useEffect(() => {
    if (
      clerkAuth.isLoaded &&
      !clerkAuth.isSignedIn &&
      anonReady &&
      !anonToken
    ) {
      const timer = setTimeout(
        () => setBothFailed(true),
        AUTH_FALLBACK_DELAY_MS
      );
      return () => {
        clearTimeout(timer);
      };
    }
    setBothFailed(false);
  }, [clerkAuth.isLoaded, clerkAuth.isSignedIn, anonReady, anonToken]);

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
            // Refresh failed — clear session and React state so the
            // bothFailed fallback can trigger or initAnonymousAuth re-runs
            clearAnonymousSession();
            setAnonToken(null);
            return null;
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

  // Both Clerk and anonymous auth resolved, neither succeeded, and the
  // grace period has elapsed — let the app render as unauthenticated
  if (bothFailed) {
    return {
      ...clerkAuth,
      isLoaded: true,
      isSignedIn: false as const,
    };
  }

  // Still loading
  return {
    ...clerkAuth,
    isLoaded: false,
  };
}

function ClerkServiceBanner({ message }: { message: string }) {
  return (
    <div className="fixed top-0 inset-x-0 z-banner bg-amber-500/90 text-amber-950 text-center text-sm py-1.5 px-4">
      {message}
    </div>
  );
}

export const ConvexProvider = ({ children }: ConvexProviderProps) => {
  const client = getOrCreateClient();

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl="/auth"
      signUpUrl="/auth"
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <ClerkDegraded>
        <ClerkServiceBanner message="Sign-in is temporarily experiencing issues. You can continue using the app." />
      </ClerkDegraded>
      <ClerkFailed>
        <ClerkServiceBanner message="Sign-in is currently unavailable. You can continue using the app as a guest." />
      </ClerkFailed>
      <ConvexProviderWithClerk client={client} useAuth={useAuthWithAnonymous}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};

export function getConvexClient() {
  return getOrCreateClient();
}
