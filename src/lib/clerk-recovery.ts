/**
 * Clerk session cookie utilities.
 *
 * Used to clear stale Clerk cookies when session recovery is needed,
 * e.g. after a long idle period or when the auth page detects a stuck state.
 * Service-level health (degraded/failed) is handled by ClerkDegraded and
 * ClerkFailed components in the provider tree.
 */

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
