/**
 * Auto-recovery for stale Clerk sessions.
 *
 * When a Clerk session expires or becomes invalid (e.g., after a long dev
 * server downtime, or on a mobile device left idle), the Clerk SDK enters
 * a retry loop hitting 429 (rate-limited) then 422 (session invalid) on its
 * token refresh endpoint. This utility detects that pattern and recovers by
 * clearing stale session cookies and reloading the page once.
 */

const RECOVERY_FLAG = "polly:clerk-session-recovered";
const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 10_000;

export function clearClerkCookies() {
  for (const cookie of document.cookie.split(";")) {
    const [rawName] = cookie.split("=");
    const name = rawName?.trim() ?? "";
    if (
      name.startsWith("__clerk") ||
      name === "__session" ||
      name === "__client_uat"
    ) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
    }
  }
}

/**
 * Install a fetch interceptor that monitors Clerk token-refresh responses.
 * After {@link FAILURE_THRESHOLD} 429/422 responses within
 * {@link FAILURE_WINDOW_MS}ms, clears stale cookies and reloads once.
 *
 * Call this once at app bootstrap, before ClerkProvider mounts.
 */
export function installClerkSessionRecovery() {
  // Skip if we just recovered — prevents infinite reload loops
  if (sessionStorage.getItem(RECOVERY_FLAG)) {
    sessionStorage.removeItem(RECOVERY_FLAG);
    return;
  }

  const originalFetch = window.fetch.bind(window);
  let failures = 0;
  let windowStart = 0;

  // biome-ignore lint/suspicious/noExplicitAny: patching global fetch requires escaping Bun's extended type
  (window as any).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const response = await originalFetch(input, init);

    const url = typeof input === "string" ? input : (input as Request)?.url;

    // Only trigger on 422 (session invalid), not 429 (rate limited).
    // A 429 is transient and Clerk's SDK handles retry-after internally.
    // A 422 means the session is genuinely dead and needs clearing.
    if (
      url?.includes("clerk.") &&
      url.includes("/tokens") &&
      response.status === 422
    ) {
      const now = Date.now();
      if (now - windowStart > FAILURE_WINDOW_MS) {
        failures = 1;
        windowStart = now;
      } else {
        failures++;
      }

      if (failures >= FAILURE_THRESHOLD) {
        console.warn(
          "[Auth] Stale Clerk session detected (%d failures in %dms). Clearing and reloading.",
          failures,
          now - windowStart
        );
        clearClerkCookies();
        sessionStorage.setItem(RECOVERY_FLAG, "1");
        window.location.reload();
      }
    }

    return response;
  };
}
