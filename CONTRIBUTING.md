# Contributing to Polly

Thanks for your interest in contributing! This doc outlines how to set up, test, and submit changes.

## Development Setup

- Node 20.x + pnpm 9.x
- Install deps: `pnpm install`
- Start backend (terminal A): `npx convex dev`
- Start frontend (terminal B): `pnpm dev`

## Pre-commit Hooks

We use Husky + lint-staged to keep quality high:

- On commit, staged files are auto-formatted and lint-fixed with Biome.
- Then `vitest run` executes the test suite. Keep unit tests fast and deterministic.
- To bypass in emergencies: `git commit --no-verify` (avoid for normal work).

## Code Quality

- Lint report: `pnpm lint`
- Lint with fixes: `pnpm lint:fix`
- Format write/check: `pnpm format` / `pnpm format:check`
- One-shot check/fix: `pnpm check` / `pnpm check:write`
- Organize imports: `pnpm imports:organize`
- Logging (Convex only): use `log.*` from `convex/lib/logger` — `console.*` is lint-blocked in `convex/**` (except `convex/lib/logger.ts`).

### Code Style (Biome enforced)

- 2 spaces, 80 char line width, double quotes, semicolons.
- Import aliases: `@/*` (src), `@convex/*` (convex), `@shared/*` (shared).
- Naming: camelCase (functions/vars), PascalCase (components/types), CONSTANT_CASE (constants).
- TypeScript: strict types, avoid `any`, prefer `type` imports, optional chaining, exhaustive deps.
- React: self-closing elements, fragment syntax `<>`, avoid array index keys.
- A11y: follow rules surfaced by Biome; fix or justify warnings in PRs.

## Testing

- Unit tests use Vitest + React Testing Library
- Local: `pnpm test`
- CI/threads pool (recommended in constrained envs): `pnpm run test:ci`
- Add tests near implementation files (e.g., `src/lib/foo.test.ts`)

### Test Environments & Setup

- Default environment is `edge-runtime` for Convex code; `jsdom` for `src/**` and `shared/**` (see `vitest.config.ts`).
- Global setup: `src/test/setup.ts` (jest-dom + minor env shims).
- Coverage: V8 provider with strict thresholds (lines/functions/branches/statements at 100%).
- Run coverage locally with `pnpm coverage` or in CI with `pnpm coverage:ci`.

Notes:
- Keep tests deterministic (no network/file system when possible)
- Favor pure utils/hooks/components
- Use `vite-tsconfig-paths`-compatible imports (`@/` paths) in tests

## CI

- GitHub Actions workflow `.github/workflows/ci.yml` runs Biome + unit tests on pushes and PRs
- Ensure tests pass and lint is clean before opening PRs

## Commit Style

- Keep commits focused and descriptive
- Reference issues where applicable

Thanks again for contributing!
