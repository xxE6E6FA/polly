# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Commands

```bash
bun run dev          # Start dev server (React Router + Convex)
bun run build        # Production build
bun run fix          # Auto-fix formatting/linting (Biome)
bun run check        # Full verification: lint + types + build
bun run typecheck    # TypeScript only
bun run test         # Run tests
```

## Stack

- **Frontend**: React 19 + TypeScript + Vite + React Router v7
- **Backend**: Convex (serverless functions, realtime DB, auth, file storage)
- **Styling**: TailwindCSS + Base UI + CVA
- **AI**: Vercel AI SDK (Anthropic, OpenAI, Google, OpenRouter)
- **Quality**: Biome (linting + formatting)

## Project Structure

```
src/
├── components/
│   ├── ui/          # Base UI primitives (Button, Dialog, etc.) - see ui/index.ts
│   ├── chat/        # Chat domain (messages, input, bubbles)
│   ├── navigation/  # Sidebar, command palette
│   ├── files/       # File display and selection
│   ├── models/      # AI model components
│   ├── layouts/     # Page layouts
│   ├── settings/    # Settings pages
│   ├── data-list/   # VirtualizedDataList
│   └── auth/        # Auth components
├── hooks/           # All hooks organized by domain - see hooks/index.ts
├── pages/           # Route components
├── providers/       # React context providers
├── lib/             # Utilities
└── shared/          # Frontend/backend shared code

convex/
├── ai/              # AI provider integrations
├── lib/             # Backend utilities
└── schema.ts        # Database schema
```

## Key Data Models (convex/schema.ts)

- `users`, `conversations`, `messages`, `personas`
- `userApiKeys`, `backgroundJobs`, `sharedConversations`

## Routes

- `/` - Home, `/chat/:id` - Conversation, `/private` - Private mode
- `/settings/*` - Settings, `/share/:id` - Shared conversation

## Code Style (Biome)

Run `bun run fix` before committing. Key rules:

- **Types**: No `any`, use `import type`, prefer `?.` over `&&`
- **React**: Exhaustive deps, no array index keys, use children composition
- **Control**: No nested ternaries, use `===`, always use `{}`
- **Backend**: Use `console.error`/`console.warn` in Convex (no custom logger)

## React Compiler

Trust the compiler for optimization. Keep `useMemo`/`useCallback` only for:
- useEvent implementations, public hook APIs, virtualized components
- Provider contexts, expensive computations (>10ms profiler-verified)
- Set/Map creation for O(1) lookups

Avoid memoization for: simple booleans, strings, filters, zero-dep callbacks.

## Hooks

**All custom hooks MUST live in `src/hooks/`** - no exceptions.

- Never create `use-*.ts` files in component directories
- Never create `hooks/` subdirectories inside components
- Export all hooks from `src/hooks/index.ts` barrel file
- Context consumer hooks (e.g., `useSpeechInputContext`) belong in `src/hooks/`, not with their provider

## Utilities

**All utility functions MUST live in `src/lib/`** - no exceptions.

- Never create `*-utils.ts` or helper files in component directories
- Parsers, formatters, validators, and general helpers belong in `src/lib/`
- Export from `src/lib/index.ts` barrel file

## Providers

**All React context providers MUST live in `src/providers/`** - no exceptions.

- Never create `*-context.tsx` files in component directories
- Context providers that are used across components belong in `src/providers/`
- The only exception is truly component-internal state (rare)

## UI Components

- **Tooltips**: Base UI `TooltipTrigger` does NOT support `asChild` - wrap children directly
- **Model types**: Use `Doc<"userModels"> | Doc<"builtInModels">` for selected models (not `Model`)

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

## Module Discovery

Import from barrel files for discoverability:

```typescript
// UI primitives
import { Button, Dialog, Input } from "@/components/ui";

// Hooks by domain
import { useChat, useSelectedModel, useDebounce } from "@/hooks";

// Utilities
import { cn, formatDate, ROUTES } from "@/lib";

// Domain components
import { Sidebar, CommandPalette } from "@/components/navigation";
import { FileDisplay, FileSelectorDialog } from "@/components/files";
import { ProviderIcon, VirtualizedModelList } from "@/components/models";
```

See JSDoc comments in barrel files (`ui/index.ts`, `hooks/index.ts`, `lib/index.ts`).
