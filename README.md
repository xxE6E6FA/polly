# Polly  

Modern AI chat application built with React Router v7, Convex, and Vercel's AI SDK.

## Quick Start

1. **Environment Setup**

   ```bash
   # Copy the environment template
   cp .env .env.local

   # Edit .env.local and set your Convex URL
   VITE_CONVEX_URL=your-convex-deployment-url
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Start Development**

   ```bash
   # Start Convex backend (in one terminal)
   npx convex dev

   # Start React Router dev server (in another terminal)
   pnpm dev
   ```

## Prerequisites

- Node 20.x
- pnpm 9.x

Install pnpm if needed: `npm i -g pnpm@9`.

## Features

- Real-time chat with multiple AI providers (OpenAI, Anthropic, Google, OpenRouter)
- Unified web search powered by Exa.ai across all AI models
- Image and PDF upload support
- Image generation via Replicate (browse curated models; add custom IDs)
- Text-to-speech via ElevenLabs (pick voices; play any message)
- Conversation persistence with Convex
- Streaming over Convex HTTP actions
- User authentication and anonymous mode
- Model switching and settings management
- Installable PWA with offline fallback (app shell cached for navigation)

## Testing & CI

- Unit tests use Vitest + React Testing Library.
- Local runs:
  - `pnpm test` – run tests locally in watch mode.
  - `pnpm test:ci` – CI-friendly test run (all tests once).
  - `pnpm test:changed` – run tests only for changed files.
- Type checking:
  - `pnpm typecheck` – TypeScript type validation (`tsc --noEmit`).
- Lint/format:
  - `pnpm lint` – Biome lint report.
  - `pnpm lint:fix` – Biome lint with auto-fix.
  - `pnpm format` / `pnpm format:check` – format write/check.
  - `pnpm check` / `pnpm check:write` – lint+format check or write (also organizes imports).
  - `pnpm imports:organize` – organize imports only.
- Complete validation:
  - `pnpm validate` – run all checks (typecheck + lint + all tests).
- CI:
  - GitHub Actions workflow at `.github/workflows/ci.yml` runs Biome, tests, and a frontend build on pushes and PRs.

### Coverage

- Coverage uses V8 provider with strict thresholds defined in `vitest.config.ts`.
- Run `pnpm coverage` locally; CI uses `pnpm coverage:ci`.

## Pre-commit Hooks

This repo uses Husky + lint-staged to ensure code quality:

**Automated checks on every commit:**
- **Formatting & Linting**: Biome formats and applies lint fixes to staged files
- **Type Checking**: TypeScript validates types across the entire codebase (`tsc --noEmit`)
- **Testing**: Vitest runs tests for changed files (`vitest run --changed`)

**Manual validation commands:**
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm pre-commit` - Run all pre-commit checks manually (typecheck + lint + changed tests)
- `pnpm validate` - Full validation (typecheck + lint + all tests)

If absolutely necessary, bypass hooks with `git commit --no-verify` (not recommended).

## Environment Variables

### Frontend (.env.local)

- `VITE_CONVEX_URL` - Your Convex deployment URL (required for app to function)

### Convex Backend (Set in Convex Dashboard)

#### Core Services

- `GEMINI_API_KEY` - Google Gemini API key (required for title and summary generation)
- `OPENAI_API_KEY` - OpenAI API key (required for audio transcription) 
- `EXA_API_KEY` - Exa.ai API key (enables web search for all AI models)

#### OAuth Authentication

- `AUTH_GOOGLE_ID` - Google OAuth Client ID (required for Google sign-in)
- `AUTH_GOOGLE_SECRET` - Google OAuth Client Secret (required for Google sign-in)
- `SITE_URL` - Your production URL, e.g., `https://your-app.com` (required for OAuth redirects)
- `CONVEX_SITE_URL` - Same as SITE_URL (for backward compatibility)

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Configure:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:5173` (development)
     - Your production domain (e.g., `https://your-app.vercel.app`)
     - Note: For preview deployments, you'll need to add each preview URL individually, or use a single production domain
   - Authorized redirect URIs:
     - `https://your-convex-deployment.convex.cloud/auth/callback/google` (required - this is your Convex deployment URL)
     - Note: For preview deployments, the OAuth callback goes to Convex, not Vercel, so you only need to register your Convex deployment URL once. This single redirect URI works for all preview deployments.
6. Copy the Client ID and Client Secret
7. Add them to Convex Dashboard → Settings → Environment Variables
8. Set `CONVEX_SITE_URL` in Convex Dashboard to your Convex deployment URL (e.g., `https://your-app.convex.cloud`) - this ensures OAuth callbacks work for all preview deployments

**Important for Preview Deployments:** Since Google OAuth doesn't support wildcards in redirect URIs, ensure `CONVEX_SITE_URL` points to your Convex deployment URL (not the Vercel preview URL). This way, all preview deployments use the same Convex callback URL, which you only need to register once in Google Cloud Console.

## Web Search Integration

Polly uses [Exa.ai](https://exa.ai) as a unified web search provider for all AI models, providing consistent, high-quality neural search results.

### How It Works

The system intelligently detects when web search would enhance the response:

1. An LLM analyzes the user's query to determine if web search would be beneficial
2. If search is needed, Exa's neural search API is automatically invoked
3. Search results are injected as context for the AI model
4. Citations are displayed with the response and enriched with metadata

This contextual approach ensures web search is used only when it adds value, avoiding unnecessary searches for simple queries.

### Setup (For Administrators)

1. Get an API key from [https://dashboard.exa.ai](https://dashboard.exa.ai)
2. Add `EXA_API_KEY` to your Convex environment variables
3. Web search capability will be automatically available when needed

**Note**: Web search is a server-side feature. Users cannot configure their own Exa API keys.

## Replicate (Images)

- Add your Replicate API key in Settings → API Keys
- Go to Settings → Models → Image to:
  - Browse curated text-to-image models from Replicate
  - Search all Replicate models
  - Add a custom model by ID (e.g., `stability-ai/sdxl`)

## ElevenLabs (TTS)

- Add your ElevenLabs API key in Settings → API Keys
- Configure in Settings → Models → Text-to-Speech:
  - Pick model and voice (your ElevenLabs voices are listed)
  - Choose stability mode and enhanced processing
- Play any message via the speaker icon in message actions; per-persona voice override is available in Persona settings.

## Build Notes

- `pnpm build` runs `convex deploy && vite build` and requires your Convex project to be configured.
- If you only need a static frontend build, use `pnpm run build:frontend`.
- In CI we build the frontend with `build:frontend`; backend deploys are handled separately.

### PWA

The app now ships a minimal PWA:

- `public/manifest.webmanifest` – app metadata + icons.
- `public/sw.js` – caches the app shell and static assets.
- Registration happens in `src/entry.client.tsx` (production only).

Notes:

- On first load, the service worker caches `/index.html` and core assets.
- SPA navigations work offline via the cached shell; dynamic API calls will naturally fail while offline.
- Clear caches by opening DevTools → Application → Clear storage, or from code via `navigator.serviceWorker.controller?.postMessage('CLEAR_POLLY_CACHES')`.

## Code Style

Code style is enforced by Biome (see `biome.json`). Highlights:

- 2-space indentation, 80 char line width, double quotes, semicolons.
- Import aliases: `@/*` for `src`, `@convex/*` for `convex`, `@shared/*` for `shared`.
- Naming: camelCase (functions/vars), PascalCase (components/types), CONSTANT_CASE (constants).
- React: prefer fragments (`<>`), self-closing elements, avoid array index keys.

See CONTRIBUTING.md for more details.
