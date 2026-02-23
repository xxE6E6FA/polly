# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Context Map

- `.claude/rules/convex.md` — Query/Mutation/Action patterns, indexes, auth, OCC
- `.claude/rules/domain.md` — Domain glossary: Conversation, Branch, Streaming, Persona
- `CONTRIBUTING.md` — Test isolation, pre-commit hooks, quality commands
- `convex/migrations/README.md` — Migration ordering and CLI helpers

## Reading Order (fresh sessions)

1. This file (conventions + gotchas)
2. `src/types/index.ts` (all domain types)
3. `convex/lib/schemas.ts` (database structure)
4. Barrel files: `src/hooks/index.ts`, `src/lib/index.ts`, `src/components/ui/index.ts`

## Commands

- `bun run dev` — start dev server
- `bun run check` — full verification (lint + types + build)
- `bun run fix` — auto-fix formatting/linting
- `bun run test` — run tests (`bun:test`, not jest/vitest)
- `bun run lint:file <path>` / `bun run check:file <path>` — single-file fix/check

## Testing

- `bun test <path>` — run a single test file
- `bun test --watch` — watch mode
- Test utils in `test/` directory (`test-utils.tsx`, `convex-test-utils.ts`, `TestProviders.tsx`)
- Run targeted tests for what you changed, not the full suite

## Project Structure

```
src/
├── components/      # UI primitives in ui/, domain components in chat/, navigation/, etc.
├── hooks/           # All custom hooks - see hooks/index.ts
├── lib/             # Utilities - see lib/index.ts
├── pages/           # Route components
├── providers/       # React context providers
├── stores/          # Zustand stores
├── types/           # Type definitions
└── loaders/         # React Router loaders

shared/              # Frontend/backend shared code (top-level)
convex/              # Backend: schema.ts, ai/, lib/
```

## Routes

`/`, `/chat/:id`, `/chat/favorites`, `/private`, `/settings/*`, `/share/:id`

## React Compiler

Trust the compiler for optimization. Keep `useMemo`/`useCallback` only for:
- Public hook APIs, virtualized components
- Provider contexts, expensive computations (>10ms profiler-verified)
- Set/Map creation for O(1) lookups

Avoid memoization for: simple booleans, strings, filters, zero-dep callbacks.

## Code Organization

- **Hooks**: All in `src/hooks/`, exported from `hooks/index.ts`. Domain subdirs allowed (e.g., `chat-ui/`).
- **Utilities**: All in `src/lib/`, exported from `lib/index.ts`
- **Providers**: All in `src/providers/`
- **Stores**: All Zustand stores in `src/stores/`

Never create hooks, utils, or context files inside component directories.

## UI Components

- Base UI uses `render` prop (not `asChild`) to customize element rendering
- Model types: `Doc<"userModels"> | Doc<"builtInModels">` for selected models

## Styling

- Use `stack-*` spacing (not `space-y-*`): `stack-xs`, `stack-sm`, `stack-md`, `stack-lg`
- Theme tokens: `bg-background`, `text-foreground`, `bg-card`, `border-border`
- Z-index classes: `z-sidebar`, `z-popover`, `z-modal`, `z-command-palette`
- Focus: `focus-visible:ring-2 focus-visible:ring-ring`

## Commits

See `CONTRIBUTING.md` for format and conventions.

## File Naming

All files use **kebab-case**: `chat-message.tsx`, `use-chat.ts`, `user-bubble.tsx`

## Imports

Use barrel files: `@/components/ui`, `@/hooks`, `@/lib`. See JSDoc in each `index.ts`.

## Gotchas

- **OCC (Optimistic Concurrency Control)**: Mutations that touch hot documents must be idempotent. Use `withRetry(fn, 5, 25)` for OCC-prone mutations
- **Model capabilities**: Resolved at query time from `modelsDevCache` table, NOT stored on model documents. See hydration in `convex/lib/model-hydration.ts`

## Code Review (GitHub)

When reviewing PRs (via `@claude review` or `claude-review` label):

**Flag these:**
- Security issues (auth bypass, injection, data exposure)
- Bugs and correctness problems
- Incorrect Convex patterns (missing indexes, wrong validators)
- Missing error handling in critical paths

**Skip these:**
- Style preferences (Biome handles formatting/linting)
- Minor naming suggestions
- "Consider using X instead of Y" unless it's a real problem

**Critical paths** (extra scrutiny):
- `convex/auth/` — authentication logic
- `convex/ai/` — AI integration, prompt handling, streaming
- `src/providers/` — React context, state management
