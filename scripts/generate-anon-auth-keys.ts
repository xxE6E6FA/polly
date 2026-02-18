/**
 * Generate RS256 key pair for anonymous JWT auth and set the env vars
 * on the Convex deployment automatically via `convex env set`.
 *
 * Derives the issuer URL from VITE_CONVEX_URL in .env.local.
 *
 * Usage:
 *   bun scripts/generate-anon-auth-keys.ts          # dev deployment
 *   bun scripts/generate-anon-auth-keys.ts --prod   # production deployment
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair } from "jose";

function getConvexSiteUrl(): string {
  const envPath = resolve(import.meta.dir, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");

  const match = envContent.match(/VITE_CONVEX_URL=(.+)/);
  if (!match?.[1]) {
    throw new Error("VITE_CONVEX_URL not found in .env.local");
  }

  return match[1].trim().replace(/\.convex\.cloud$/, ".convex.site");
}

function convexEnvSet(name: string, value: string, prod: boolean): void {
  const args = ["convex", "env", "set", name];
  if (prod) {
    args.push("--prod");
  }
  // Pipe value via stdin to handle multiline PEM keys
  execFileSync("bunx", args, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

async function main() {
  const prod = process.argv.includes("--prod");

  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  const issuer = getConvexSiteUrl();

  console.log(`Issuer: ${issuer}`);
  console.log(`Target: ${prod ? "production" : "dev"} deployment\n`);

  console.log("Setting ANON_AUTH_PRIVATE_KEY...");
  convexEnvSet("ANON_AUTH_PRIVATE_KEY", privatePem, prod);

  console.log("Setting ANON_AUTH_PUBLIC_KEY...");
  convexEnvSet("ANON_AUTH_PUBLIC_KEY", publicPem, prod);

  console.log("Setting ANON_AUTH_ISSUER...");
  convexEnvSet("ANON_AUTH_ISSUER", issuer, prod);

  // Build JWKS and store as base64-encoded data URI for auth.config.ts.
  // Convex can't fetch JWKS from its own HTTP endpoints (loopback), so we
  // embed the JWKS directly in the auth config via a data URI.
  const jwk = await exportJWK(publicKey);
  const jwks = JSON.stringify({
    keys: [{ ...jwk, alg: "RS256", use: "sig", kid: "anon-auth-1" }],
  });
  const jwksBase64 = Buffer.from(jwks).toString("base64");

  console.log("Setting ANON_AUTH_JWKS_BASE64...");
  convexEnvSet("ANON_AUTH_JWKS_BASE64", jwksBase64, prod);

  console.log("\nDone. Anonymous auth env vars are set.");
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
