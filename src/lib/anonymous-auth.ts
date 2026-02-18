/**
 * Anonymous auth session management.
 *
 * Handles fetching, refreshing, and storing anonymous JWT tokens
 * for unauthenticated users. Tokens are stored in localStorage
 * and auto-refreshed before expiry.
 */

import { CACHE_KEYS, del, get, set } from "./local-storage";

interface AnonymousSession {
  token: string;
  externalId: string;
  expiresAt: number;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export function getAnonymousSession(): AnonymousSession | null {
  return get<AnonymousSession | null>(CACHE_KEYS.anonymousSession, null);
}

export function setAnonymousSession(session: AnonymousSession): void {
  set(CACHE_KEYS.anonymousSession, session);
}

export function clearAnonymousSession(): void {
  del(CACHE_KEYS.anonymousSession);
}

export function isSessionExpired(session: AnonymousSession): boolean {
  return Date.now() >= session.expiresAt - REFRESH_BUFFER_MS;
}

function parseTokenExpiry(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length === 3 && parts[1]) {
      // JWT uses base64url encoding — convert to standard base64 for atob
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      if (typeof payload.exp === "number") {
        return payload.exp * 1000; // Convert seconds to ms
      }
    }
  } catch {
    // Fall through
  }
  // Default to 55 minutes from now if we can't parse
  return Date.now() + 55 * 60 * 1000;
}

export async function fetchAnonymousToken(
  siteUrl: string
): Promise<AnonymousSession> {
  const response = await fetch(`${siteUrl}/auth/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Anonymous auth failed: ${response.status}`);
  }

  const data: { token: string; externalId: string } = await response.json();
  const session: AnonymousSession = {
    token: data.token,
    externalId: data.externalId,
    expiresAt: parseTokenExpiry(data.token),
  };

  setAnonymousSession(session);
  return session;
}

export async function refreshAnonymousToken(
  siteUrl: string,
  session: AnonymousSession
): Promise<AnonymousSession> {
  const response = await fetch(`${siteUrl}/auth/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: session.token }),
  });

  if (!response.ok) {
    throw new Error(`Anonymous token refresh failed: ${response.status}`);
  }

  const data: { token: string; externalId: string } = await response.json();
  const newSession: AnonymousSession = {
    token: data.token,
    externalId: data.externalId,
    expiresAt: parseTokenExpiry(data.token),
  };

  setAnonymousSession(newSession);
  return newSession;
}
