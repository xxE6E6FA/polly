# Agent Guidelines for Polly

## Build/Lint/Test Commands
- **Build**: `bun run build` (includes Convex deploy)
- **Lint**: `bun run lint`
- **Format**: `bun run format` or `bun run format:check`
- **Check all**: `bun run check` (lint + build) or `bun run check:write` (auto-fix)
- **Dev**: `bun run dev`
- **Test**: `bun test` (all tests) or `bun test <file>` (specific file)
  - For deterministic results: `bun test --seed=3080887667`
  - Individual test files have 100% pass rate
  - Full suite: 99.5% pass rate (1-6 failures due to global store race conditions)
  - Tests run in parallel across files for speed
  - Use `bun test --seed=<number>` for deterministic results
  - If a seeded run (e.g., `bun test --seed=1198959309`) fails, look for cross-file pollution from shared module mocks or singleton stores. Prefer rendering against real providers/stores with helpers instead of `mock.module()` overrides in test files.
  - Zustand stores auto-reset after each test via `resetVanillaStores()` and `resetReactStores()` in `test/setup-bun.ts`; leave those helpers in place and avoid custom store resets unless a test needs a bespoke store instance.
  - **Store method binding**: When implementing store hooks with `Object.assign`, methods MUST use dynamic access (arrow functions that call `storeApi.method()`), not static binding (`.bind()` or direct assignment), to support test isolation via `setStoreApi()`.
- **Imports**: organize via `bun run check:write` (Biome organizes imports when writing)

## Code Style (Biome enforced)
- **Formatting**: 2 spaces, 80 char line width, double quotes, semicolons
- **Imports**: Use `@/` for src imports, organize imports frequently
- **Naming**: camelCase (functions/vars), PascalCase (React components/types), CONSTANT_CASE (constants)
- **React**: PascalCase components, self-closing elements, fragment syntax `<>`, no array index keys
- **TypeScript**: Strict types, no `any`, use `type` imports, optional chaining, exhaustive deps

## Error Handling
- Use proper error boundaries and try/catch blocks
- For Convex backend, use `log.*` from `convex/lib/logger` instead of `console.*` (lint-blocked).
- Return user-friendly error messages; silently catch localStorage errors in browser.

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS + Radix UI + React Router
- **Backend**: Convex (realtime database/functions, auth, file storage)
- **AI**: Multiple providers (Anthropic, OpenAI, Google, OpenRouter) via AI SDK
- **Key Data**: Users, conversations, messages, personas, API keys, background jobs
- **Streaming**: Real-time chat streamed over Convex HTTP actions

## UI Styling Guidelines (Tailwind + shadcn)
- Spacing: Use stack utilities instead of `space-y-*`.
  - Prefer semantic stacks: `stack-xs`, `stack-sm`, `stack-md`, `stack-lg`, `stack-xl`.
  - Numeric stacks also exist: `.stack-1`, `.stack-1.5`, `.stack-2`, etc.
  - Responsive works as usual: `sm:stack-md`, `lg:stack-xl`.
- Colors: Use theme tokens, not hard-coded colors.
  - Surfaces/text: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`.
  - Accents: `bg-accent` + `text-accent-foreground`, primary/semantic variants via component props when available.
- Elevation: Use Tailwind `shadow-*` utilities (mapped to design tokens).
  - `shadow-sm`→elevation-1, `shadow`/`shadow-md`→elevation-2, `shadow-lg`→elevation-3, `shadow-xl`→elevation-4, `shadow-2xl`→elevation-5.
  - Avoid inline `box-shadow` styles.
- Radius: Use Tailwind `rounded-*` classes; `rounded-lg` maps to the app radius token.
- Focus states: Use `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
- Buttons/Badges: Prefer component variants (e.g., `variant="secondary"`, `variant="outline"`) over manual classes.
- Typography: Default body uses Inter; prefer `leading-relaxed` or rely on base; use `text-balance`/`text-pretty` where appropriate.
- Don’ts: Avoid `space-y-*` for sibling spacing, raw hex colors, ad-hoc shadows, and inline styles for layout.

### Density
- Wrap any container with `density-compact` to reduce vertical rhythm one step (e.g., `stack-lg` acts like `stack-md`).
- Wrap with `density-spacious` to increase rhythm one step (e.g., `stack-md` acts like `stack-lg`).
- Apply at page or section level depending on desired feel; leave default for general pages.
