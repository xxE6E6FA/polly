/**
 * Anonymous JWT auth — mints RS256 JWTs for anonymous users and
 * serves the public key as a JWKS endpoint so Convex can validate them.
 */

import { exportJWK, importPKCS8, importSPKI, SignJWT, jwtVerify } from "jose";

const ALG = "RS256";
const TOKEN_LIFETIME_SECONDS = 3600; // 1 hour

/**
 * Mint a signed JWT for an anonymous user.
 *
 * @param privateKeyPem - PEM-encoded PKCS8 private key
 * @param issuer - The issuer URL (deployment's .convex.site URL)
 * @param subject - The external ID for this anonymous user
 * @returns Signed JWT string
 */
export async function mintAnonymousToken(
	privateKeyPem: string,
	issuer: string,
	subject: string,
): Promise<string> {
	const privateKey = await importPKCS8(privateKeyPem, ALG);

	const now = Math.floor(Date.now() / 1000);

	return new SignJWT({})
		.setProtectedHeader({ alg: ALG, kid: "anon-auth-1" })
		.setIssuer(issuer)
		.setSubject(subject)
		.setAudience("convex")
		.setIssuedAt(now)
		.setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
		.sign(privateKey);
}

/**
 * Verify a previously-minted anonymous JWT and return its subject claim.
 *
 * @returns The `sub` claim if valid, or `null` if verification fails.
 */
export async function verifyAnonymousToken(
	token: string,
	publicKeyPem: string,
	issuer: string,
): Promise<string | null> {
	try {
		const publicKey = await importSPKI(publicKeyPem, ALG);
		const { payload } = await jwtVerify(token, publicKey, {
			issuer,
			audience: "convex",
			algorithms: [ALG],
		});
		return typeof payload.sub === "string" ? payload.sub : null;
	} catch {
		return null;
	}
}

/**
 * Build a JWKS (JSON Web Key Set) from the public key PEM.
 * Returns the object to be serialised as `/.well-known/jwks.json`.
 */
export async function buildJwks(
	publicKeyPem: string,
): Promise<{ keys: object[] }> {
	const publicKey = await importSPKI(publicKeyPem, ALG);
	const jwk = await exportJWK(publicKey);

	return {
		keys: [
			{
				...jwk,
				alg: ALG,
				use: "sig",
				kid: "anon-auth-1",
			},
		],
	};
}
