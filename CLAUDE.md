# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Core Development:**
- `pnpm dev` - Start React Router development server
- `npx convex dev` - Start Convex backend (run in separate terminal)
- `pnpm build` - Build for production (includes `convex deploy`)

**Code Quality:**
- `pnpm lint` - Analyze code with Biome
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check` - Run lint + typecheck + build
- `pnpm check:write` - Auto-fix all issues
- `pnpm imports:organize` - Organize import statements

**Database Management:**
- `pnpm clear-db` - Clear entire database (development)
- `pnpm clear-auth` - Clear authentication tables only

## Architecture Overview

**Stack:**
- Frontend: React 19 + TypeScript + Vite + React Router v7
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
- No testing framework currently configured (Vitest + React Testing Library preferred)
