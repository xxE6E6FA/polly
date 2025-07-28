# Agent Guidelines for Polly

## Build/Lint/Test Commands
- **Build**: `pnpm build` (includes Convex deploy)
- **Lint**: `pnpm lint` or `pnpm lint:fix` (auto-fix)
- **Format**: `pnpm format` or `pnpm format:check`
- **Check all**: `pnpm check` (lint + build) or `pnpm check:write` (auto-fix)
- **Dev**: `pnpm dev`
- **Test**: `pnpm test` (Playwright e2e), `pnpm test:integration` (streaming tests)
- **Imports**: `pnpm imports:organize` to organize imports

## Code Style (Biome enforced)
- **Formatting**: 2 spaces, 80 char line width, double quotes, semicolons
- **Imports**: Use `@/` for src imports, organize imports frequently
- **Naming**: camelCase (functions/vars), PascalCase (React components/types), CONSTANT_CASE (constants)
- **React**: PascalCase components, self-closing elements, fragment syntax `<>`, no array index keys
- **TypeScript**: Strict types, no `any`, use `type` imports, optional chaining, exhaustive deps

## Error Handling
- Use proper error boundaries and try/catch blocks
- Log errors with `console.error`/`console.warn` (allowed in Biome config)
- Return user-friendly error messages, silent catch for localStorage errors

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS + Radix UI + React Router
- **Backend**: Convex (realtime database/functions, auth, file storage)
- **AI**: Multiple providers (Anthropic, OpenAI, Google, OpenRouter) via AI SDK
- **Key Data**: Users, conversations, messages, personas, API keys, background jobs
- **Streaming**: Real-time chat with persistent streaming via Convex