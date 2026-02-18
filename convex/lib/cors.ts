/**
 * CORS origin validation.
 *
 * Validates the request Origin header against an allowlist to prevent
 * arbitrary websites from making credentialed cross-origin requests.
 *
 * Allowlist sources:
 *  - `SITE_URL` env var (production)
 *  - localhost / 127.0.0.1 (development)
 *
 * When `SITE_URL` is not set the function is permissive (reflects any
 * origin) so local development works without extra configuration.
 */
export function getAllowedOrigin(request: Request): string {
	const origin = request.headers.get("Origin");
	if (!origin) {
		// No Origin header → not a CORS request (e.g. server-to-server)
		return "*";
	}

	// Always allow localhost for development
	try {
		const url = new URL(origin);
		if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
			return origin;
		}
	} catch {
		// Invalid origin URL — fall through to reject
	}

	const siteUrl = process.env.SITE_URL;

	// Allow the configured production URL
	if (siteUrl && origin === siteUrl) {
		return origin;
	}

	// When SITE_URL is not configured (local dev without env), allow all
	if (!siteUrl) {
		return origin;
	}

	// Origin not in allowlist — return the fixed SITE_URL so the browser's
	// CORS check sees a mismatch and blocks the response.
	return siteUrl;
}
