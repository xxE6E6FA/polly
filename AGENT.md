# Agent Guidelines for Polly

## Build/Lint/Test Commands
- **Build**: `pnpm build` (includes Convex deploy)
- **Lint**: `pnpm lint` or `pnpm lint:fix` (auto-fix)
- **Format**: `pnpm format` or `pnpm format:check`
- **Check all**: `pnpm check` (lint + build) or `pnpm check:write` (auto-fix)
- **Dev**: `pnpm dev`
- **Test**: `pnpm test` (Vitest), `pnpm run test:ci` (Vitest threads pool for CI)
- **Imports**: organize via `pnpm check:write` (Biome organizes imports when writing)

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

## Testing
- Framework: Vitest with `jsdom` environment; setup at `src/test/setup.ts`.
- Locations: Place tests under `src/**` or `shared/**` using `*.test.ts(x)`.
- Aliases: Import app code via `@/` and shared via `@shared/`; mock with `vi.mock("@/path", ...)`.
- Helpers (prefer these):
  - `src/test/utils.ts`:
    - `makeNdjsonStream(lines)` — create NDJSON `ReadableStream`.
    - `flushPromises(times)` — flush microtasks; for timers prefer `flushAll`.
    - `mockGlobalFetchOnce(response)` — one-shot `fetch` mock.
    - `withMockedURLObjectURL()`, `stubAnchorClicks()` — URL/anchor shims.
    - `installFileReader*`, `installImageMock`, `installCanvasMock` — DOM/file mocks.
    - New utilities:
      - `makeFileList(files)` — build a `FileList` from `File[]`.
      - `mockFetchNDJSON(chunks)` — mock `fetch` to stream NDJSON from strings/objects.
      - `mockGlobalFetchSequence(responses[])` — queue multiple `fetch` results.
      - `flushAll({ microtasks, timersMs })` — flush microtasks and advance timers.
      - `withFakeTimers(fn)` — RAII helper to run a block with fake timers.
      - `createOverlaysMock()` — returns `{ overlays, factory }` for `@/stores/stream-overlays` mocks.
- Patterns:
  - Streaming tests: use `mockFetchNDJSON` or `makeNdjsonStream` + `flushAll`.
  - Hooks with timers: wrap in `vi.useFakeTimers()` or `withFakeTimers()` and advance with `act(() => vi.advanceTimersByTime(...))`.
  - File uploads: construct `FileList` via `makeFileList` (avoid manual `Object.assign`).
  - Convex/overlays: mock modules at top-level; reuse `createOverlaysMock().factory`.
  - Keep `vi.mock(...)` at module scope before importing the system under test.
  - If a `vi.mock` factory needs helpers from `src/test/utils.ts`, prefer dynamic import inside the factory:
    `vi.mock("@/stores/stream-overlays", async () => { const { createOverlaysMock } = await import("../../test/utils"); ... })` to avoid hoisting issues.

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
