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

**Always use `bun`** - never npm, pnpm, or npx.

```bash
bun run dev          # Start dev server (React Router + Convex)
bun run build        # Production build
bun run fix          # Auto-fix formatting/linting (Biome)
bun run check        # Full verification: lint + types + build
bun run check:json   # Same as check but with JSON reporter (structured errors)
bun run typecheck    # TypeScript only
bun run test         # Run tests
bun run lint:file <path>   # Auto-fix a single file
bun run check:file <path>  # Lint-check a single file (no fix)
bunx <package>       # Instead of npx
```

## Testing

- Framework: **bun:test** (not jest/vitest)
- `bun test <path>` — run a single test file
- `bun test --watch` — watch mode
- Test utils in `test/` directory (`test-utils.tsx`, `convex-test-utils.ts`, `TestProviders.tsx`)
- Run targeted tests for what you changed, not the full suite

## Stack

- **Frontend**: React 19 + TypeScript + Vite + React Router v7
- **Backend**: Convex (serverless functions, realtime DB, auth, file storage)
- **Styling**: TailwindCSS + Base UI + CVA
- **AI**: Vercel AI SDK (Anthropic, OpenAI, Google, OpenRouter)
- **Quality**: Biome (linting + formatting)

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

## Code Style (Biome)

Run `bun run fix` before committing. Key rules:

- **Types**: No `any`, use `import type`, prefer `?.` over `&&`
- **React**: Exhaustive deps, no array index keys, use children composition
- **Control**: No nested ternaries, use `===`, always use `{}`
- **Backend**: Use `console.error`/`console.warn` in Convex (no custom logger)

## React 19 Patterns

- **Refs as props**: Pass `ref` as a regular prop - no `forwardRef` needed
- **useTransition**: Use for async mutations instead of manual loading state

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
- Tooltip delays: Use `delayDuration={200}` on `TooltipTrigger` for quick actions (icon buttons, copy buttons). Default 600ms is for explanatory tooltips.
- Model types: `Doc<"userModels"> | Doc<"builtInModels">` for selected models

## Styling

- Use `stack-*` spacing (not `space-y-*`): `stack-xs`, `stack-sm`, `stack-md`, `stack-lg`
- Theme tokens: `bg-background`, `text-foreground`, `bg-card`, `border-border`
- Z-index classes: `z-sidebar`, `z-popover`, `z-modal`, `z-command-palette`
- Focus: `focus-visible:ring-2 focus-visible:ring-ring`

## Commits

- Format: `<type>: <description>` (feat, fix, refactor, chore, test, docs)
- Title only, no body. Split commits for different areas.
- Branches: `<type>/<description>` in kebab-case

## File Naming

All files use **kebab-case**: `chat-message.tsx`, `use-chat.ts`, `user-bubble.tsx`

## Imports

Use barrel files: `@/components/ui`, `@/hooks`, `@/lib`. See JSDoc in each `index.ts`.

## Gotchas

- **Streaming coordination**: Use `currentStreamingMessageId` on the conversation to detect/guard streaming, not `isStreaming` alone
- **OCC (Optimistic Concurrency Control)**: Mutations that touch hot documents must be idempotent. Use `withRetry(fn, 5, 25)` for OCC-prone mutations
- **Model capabilities**: Resolved at query time from `modelsDevCache` table, NOT stored on model documents. See hydration in `convex/lib/model-hydration.ts`
- **Route params**: May be `undefined` in React Router v7 — always handle the missing case
- **File deletion**: Always verify `userFiles` ownership (`entry.userId === currentUserId`) before deleting
- **Private mode**: Client-side only, no server storage. Uses `usePrivateChat` hook with user's own API keys

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
