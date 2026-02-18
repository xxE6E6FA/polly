# Environment Variables

## Frontend (.env.local)

```
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Get `VITE_CLERK_PUBLISHABLE_KEY` from [Clerk Dashboard → API Keys](https://dashboard.clerk.com/last-active?path=api-keys).

## Convex Backend

Set in Convex Dashboard → Settings → Environment Variables.

### Required

| Variable                    | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`   | Clerk JWT issuer URL (from Clerk JWT Templates)      |
| `CLERK_WEBHOOK_SECRET`      | Clerk webhook signing secret (from Clerk Webhooks)   |
| `API_KEY_ENCRYPTION_SECRET` | `openssl rand -base64 32`                            |
| `GEMINI_API_KEY`            | Title/summary generation                             |
| `OPENAI_API_KEY`            | Audio transcription                                  |
| `SITE_URL`                  | Production URL                                       |
| `CONVEX_SITE_URL`           | Same as SITE_URL                                     |

### Anonymous Auth

| Variable               | Description                                   |
| ---------------------- | --------------------------------------------- |
| `ANON_AUTH_PRIVATE_KEY` | RSA private key (PEM PKCS8) for signing JWTs |
| `ANON_AUTH_PUBLIC_KEY`  | RSA public key (PEM SPKI) for JWKS endpoint  |
| `ANON_AUTH_ISSUER`      | Deployment `.convex.site` URL (e.g. `https://your-deployment-123.convex.site`) |

### Optional

| Variable             | Description           |
| -------------------- | --------------------- |
| `EXA_API_KEY`        | Web search            |
| `ANTHROPIC_API_KEY`  | Built-in models       |
| `GROQ_API_KEY`       | Built-in models       |
| `OPENROUTER_API_KEY` | Built-in models       |
| `REPLICATE_API_KEY`  | Built-in image models |

## Clerk Setup

1. Create a [Clerk](https://clerk.com/) application
2. Enable sign-in methods (Google, GitHub, Email, etc.)
3. Go to **JWT Templates** → create a template named **`convex`** → copy the **Issuer URL**
4. Set `CLERK_JWT_ISSUER_DOMAIN` in Convex Dashboard to that Issuer URL
5. Go to **Webhooks** → create an endpoint pointing to `<CONVEX_SITE_URL>/clerk-users-webhook`
6. Subscribe to `user.created`, `user.updated`, `user.deleted` events
7. Copy the **Signing Secret** → set as `CLERK_WEBHOOK_SECRET` in Convex Dashboard
8. Copy the **Publishable Key** from API Keys → set as `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`

## Anonymous Auth Setup

Anonymous auth lets signed-out users chat with a rate limit (10 messages). Their conversations are stored in the database and transfer to their account on sign-up.

It works by minting RS256 JWTs from a Convex HTTP action. Convex validates these alongside Clerk JWTs using a `customJwt` provider in `auth.config.ts`.

### 1. Generate keys and set env vars

```bash
bun scripts/generate-anon-auth-keys.ts          # dev deployment
bun scripts/generate-anon-auth-keys.ts --prod   # production deployment
```

This generates an RS256 key pair, derives the issuer URL from `VITE_CONVEX_URL` in `.env.local`, and sets all three env vars on the Convex deployment via `convex env set`.

The issuer URL **must** match the deployment's `.convex.site` URL exactly — it's encoded in every JWT and Convex checks it during validation.

### 3. Verify

After deploying:

- `GET <ANON_AUTH_ISSUER>/.well-known/jwks.json` should return a valid JWK set
- Opening the app signed out should create a `Guest` user in the database
- The anonymous user can chat (up to 10 messages)
- Signing in via Clerk transfers anonymous conversations to the Clerk user

### How it works

1. Frontend (`convex-provider.tsx`) detects Clerk is not signed in
2. Fetches a JWT from `POST <site-url>/auth/anonymous`
3. The HTTP action creates a `users` record with `isAnonymous: true` and mints a 1-hour RS256 JWT
4. `ConvexProviderWithClerk` receives the JWT via a custom `useAuth` hook — Convex sees the user as authenticated
5. All existing `getAuthUserId(ctx)` calls resolve the anonymous JWT identity to the `users` record — zero backend changes needed
6. Token auto-refreshes 5 minutes before expiry
7. On Clerk sign-in, the anonymous `externalId` is stashed in localStorage and `graduateAnonymousUser` transfers conversations/messages to the Clerk user
