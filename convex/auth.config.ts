import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // biome-ignore lint/style/noNonNullAssertion: env var required at deploy time
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
    {
      type: "customJwt",
      // biome-ignore lint/style/noNonNullAssertion: env var required at deploy time
      issuer: process.env.ANON_AUTH_ISSUER!,
      // biome-ignore lint/style/noNonNullAssertion: env var required at deploy time
      jwks: `data:text/plain;charset=utf-8;base64,${process.env.ANON_AUTH_JWKS_BASE64!}`,
      applicationID: "convex",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
