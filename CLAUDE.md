# CLAUDE.md

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

## Styling

- Use `stack-*` spacing (not `space-y-*`): `stack-xs`, `stack-sm`, `stack-md`, `stack-lg`
- Z-index classes: `z-sidebar`, `z-popover`, `z-modal`, `z-command-palette`

## Convex Patterns

- Always use `.withIndex()` — never `.filter()` for indexed fields
- Compound index field order matters: `["userId", "conversationId"]` supports `eq("userId")` alone but NOT `eq("conversationId")` alone
- Auth: `getAuthUserId(ctx)` then `checkConversationAccess(ctx, conversationId, userId)` for conversation access
- Actions cannot read/write DB directly — must call mutations/queries via `ctx.runMutation()` / `ctx.runQuery()`
- Schemas live in `convex/lib/schemas.ts`; indexes in `convex/schema.ts`
- New fields: `v.optional()` for backward compat. Use `.extend()` for schema composition.

## Gotchas

- **OCC**: Mutations on hot documents must be idempotent. Use `withRetry(fn, 5, 25)` from `convex/lib/utils.ts`
- **Model capabilities**: Resolved at query time from `modelsDevCache`, NOT stored on model documents. See `convex/lib/model-hydration.ts`
- **Persona snapshots**: `personaName`/`personaIcon` are snapshotted onto messages at creation — changing conversation persona doesn't update existing messages
- **Streaming race guard**: `currentStreamingMessageId` on conversation — the `finally` block only clears `isStreaming` if its messageId matches, preventing races between overlapping actions
- **stopRequested**: Timestamp (not boolean). Streaming action checks it periodically and stops gracefully
