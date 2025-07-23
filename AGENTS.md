# Agent Guidelines for Polly

## Build/Lint/Test Commands
- **Build**: `pnpm build` (includes Convex deploy)
- **Lint**: `pnpm lint` or `pnpm lint:fix` (auto-fix)
- **Format**: `pnpm format` or `pnpm format:check`
- **Check all**: `pnpm check` (lint + build) or `pnpm check:write` (auto-fix)
- **Dev**: `pnpm dev`
- **No test framework** - verify changes by running build/lint

## Code Style (Biome enforced)
- **Formatting**: 2 spaces, 80 char line width, double quotes, semicolons
- **Imports**: Use `@/` for src imports, organize with `pnpm imports:organize`
- **Naming**: camelCase (functions/vars), PascalCase (types/components), CONSTANT_CASE (constants)
- **React**: PascalCase components, self-closing elements, fragment syntax `<>`, no array index keys
- **TypeScript**: Strict types, no `any`, use `type` imports, optional chaining

## Error Handling
- Use proper error boundaries and try/catch blocks
- Log errors with `console.error` (allowed in Biome config)
- Return user-friendly error messages

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS + Radix UI
- **Backend**: Convex (realtime database/functions)
- **AI**: Multiple providers (Anthropic, OpenAI, Google) via AI SDK