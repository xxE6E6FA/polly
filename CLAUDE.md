# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Core Development:**

- `bun run dev` - Start React Router development server (includes Convex backend)
- `bun run dev:convex` - Start Convex backend separately (if needed)
- `bun run build` - Build frontend for production and deploy Convex backend

**Code Quality:**

- `bun run fix` - Auto-fix formatting, linting, and organize imports (runs Biome)
- `bun run check` - Verify everything: lint + format check + typecheck + compiler health + build
- `bun run typecheck` - Run TypeScript type checking only

**Testing:**

- `bun run test` - Run tests once
- `bun run test:watch` - Run tests in watch mode

**Database Management:**

- `bun run clear-db` - Clear entire database (development)
- `bun run clear-auth` - Clear authentication tables only

## Architecture Overview

**Stack:**

- Frontend: React 19 + TypeScript + Bun bundler + React Router v7
- Backend: Convex (serverless functions, realtime database, auth, file storage)
- Styling: TailwindCSS + shadcn/ui (Radix UI components)
- AI Integration: Vercel AI SDK with multiple providers (Anthropic, OpenAI, Google, OpenRouter)
- Code Quality: Biome (replaces ESLint + Prettier)

**Key Data Models (convex/schema.ts):**

- `users` - User accounts and profiles
- `conversations` - Chat conversations with search and archiving
- `messages` - Individual chat messages with streaming support
- `personas` - User-defined AI personas/assistants
- `userApiKeys` - User's AI provider API keys
- `backgroundJobs` - Async task management
- `sharedConversations` - Public conversation sharing

**Routing Structure (src/routes.tsx):**

- `/` - Home page
- `/chat/:conversationId` - Individual conversations
- `/private` - Private chat mode
- `/settings/*` - Settings pages (API keys, models, personas, etc.)
- `/share/:shareId` - Public shared conversations

**Frontend Organization:**

- `src/components/` - Reusable UI components
- `src/pages/` - Route-specific page components
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utility functions and helpers
- `src/providers/` - React context providers
- `shared/` - Code shared between frontend and backend

**Backend Organization:**

- `convex/` - Serverless functions and database schema
- `convex/ai/` - AI provider integrations and streaming
- `convex/lib/` - Backend utilities and helpers

## AI Integration

The app supports multiple AI providers through a unified interface:

- Providers configured per-user via API keys in settings
- Streaming responses are delivered via Convex HTTP routes
- Web search integration via Exa.ai for enhanced context
- Image generation support through various providers
- Automatic reasoning mode detection for advanced models

## Development Notes

- Uses Convex for realtime features - changes sync automatically across clients
- Authentication via Convex Auth with Google OAuth
- File uploads handled through Convex file storage
- All styling follows TailwindCSS + shadcn/ui patterns
- Code formatting enforced by Biome with pre-commit hooks
- GitHub Actions workflow `.github/workflows/ci.yml` runs Biome checks and build validations on pushes and PRs.

## Commits & Pull Requests

**Commit Messages:**

- Use [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>: <description>`
- Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`, `perf`, `ci`, `build`, `revert`
- **Title only** - no body/description section
- Split commits when changes affect different areas or have different purposes
- Examples: `feat: add image generation support`, `fix: prevent message flicker during streaming`

**Branch Names:**

- Format: `<type>/<description>` (e.g., `feat/add-commit-rules`, `fix/message-flicker`)
- Use kebab-case, keep concise (30-50 characters)
- No timestamps or random suffixes

**Pull Requests:**

- PR title should be concise and descriptive (no Conventional Commits format required)
- Provide context in PR description (what, why, testing notes)
- Keep PRs focused on a single concern

See `.cursor/rules/commits-and-prs.mdc` for detailed guidelines.

## UI Styling Guidelines (Polly Design System)

- Prefer stack spacing utilities over `space-y-*`:
  - Semantic: `stack-xs`, `stack-sm`, `stack-md`, `stack-lg`, `stack-xl`
  - Numeric: `.stack-1`, `.stack-1.5`, `.stack-2`, etc. (responsive allowed)
- Use theme tokens for colors/surfaces:
  - `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`, `ring-offset-background`.
  - For emphasis, use component variants (e.g., Button `variant="primary" | "secondary" | "outline"`).
- Elevation via `shadow-*` only; mapped to our elevation scale. Avoid custom `box-shadow`.
- Radius via `rounded-*` (e.g., `rounded-lg`), which is tokenized.
- Focus states: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
- Avoid raw hex colors and `space-y-*`; use `stack-*` and tokens.

### Density

- Use `density-compact` wrapper to reduce vertical rhythm by one step; `density-spacious` to increase by one.
- Prefer section/page scope rather than global changes unless specified.
