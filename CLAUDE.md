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

## Code Style & Quality (Biome)

This project uses **Biome** for linting and formatting. Always run `bun run fix` before committing.

### Key Formatting Rules

- **Indentation**: 2 spaces (never tabs)
- **Line Width**: 80 characters maximum
- **Quotes**: Double quotes for strings and JSX
- **Semicolons**: Always required
- **Trailing Commas**: ES5 style
- **Self-Closing Elements**: Always use for elements without children (`<Button />`)
- **Fragment Syntax**: Use `<>...</>` not `<Fragment>...</Fragment>`

### Important Biome Rules to Follow

**TypeScript:**
- **No `any`**: Always use proper types or `unknown` with type guards
- **Type Imports**: Use `import type { Foo }` for types (auto-organized by Biome)
- **No Non-Null Assertion**: Avoid `!` operator (warning only)
- **Optional Chaining**: Prefer `a?.b` over `a && a.b`

**React:**
- **Exhaustive Dependencies**: All useEffect/useMemo/useCallback deps must be declared
- **No Array Index Keys**: Never use array index as `key` in `map()`
- **No Children Prop**: Use children composition, not explicit `children` prop

**Control Flow:**
- **No Nested Ternaries**: Forbidden - use if/else or helper functions instead
- **No `==`**: Always use `===` (strict equality)
- **Use Block Statements**: Always use `{}` for if/else/while bodies
- **No Empty Blocks**: Empty `{}` blocks are not allowed

**Common Pitfalls:**
- **No Console**: Backend code must use `log.*` from `convex/lib/logger` (console blocked by lint)
- **No Unused Variables**: All declared variables must be used
- **No Debugger**: Remove all `debugger` statements
- **No Parameter Reassign**: Don't reassign function parameters

### Examples

```typescript
// ✅ Good
import type { User } from "@/types";
import { useState, useEffect } from "react";

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]); // ✅ Exhaustive dependencies

  if (!user) {
    return <div>Loading...</div>;
  }

  return <div>{user.name}</div>;
}

// ❌ Bad
import { User } from "@/types"; // ❌ Should be type import
import { useState, useEffect } from "react";

function UserProfile({ userId }) { // ❌ Missing type annotation
  const [user, setUser] = useState(null); // ❌ Should be useState<User | null>

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }); // ❌ Missing dependencies

  return user ? <div>{user.name}</div> : <div>Loading...</div>; // ❌ Missing if/else blocks
}
```

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

### Z-Index Layering System

Use predefined utility classes for consistent layering (bottom to top):

- `z-content` (0): Default content area, background elements
- `z-backdrop` (5): Mobile sidebar backdrop, overlay backdrops
- `z-sidebar` (10): Sidebar components, chat header, navigation elements
- `z-chat-input` (20): Chat input container, send button groups, overlays
- `z-sticky` (30): Sticky positioned elements, floating controls, copy buttons
- `z-select` (40): Select dropdowns, status indicators, offline overlays
- `z-popover` (50): Popover content, dropdown content, form suggestions
- `z-drawer` (60): Drawer overlays, mobile navigation panels
- `z-tooltip` (70): Tooltip content, help text overlays
- `z-modal` (80): Dialog overlays, alert dialogs, zen mode, file previews
- `z-command-palette` (90): Command palette interface, quick actions
- `z-context-menu` (100): Context menus, right-click menus, submenus

**Guidelines:**

- Set z-index at primitive component level when possible (Dialog, Drawer, Popover primitives)
- Never use arbitrary values like `z-[999]` or hardcoded `z-50`
- Follow the layering hierarchy: modals above popovers, popovers above sticky elements

### Density

- Use `density-compact` wrapper to reduce vertical rhythm by one step; `density-spacious` to increase by one.
- Prefer section/page scope rather than global changes unless specified.
