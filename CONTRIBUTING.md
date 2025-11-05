# Contributing to Polly

Thanks for your interest in contributing! This doc outlines how to set up and submit changes.

## Development Setup

- Bun (latest) + Node 20.x (for Convex compatibility)
- Install deps: `bun install` (or use `mise install` if using mise)
- Start backend (terminal A): `npx convex dev`
- Start frontend (terminal B): `bun run dev`

## Pre-commit Hooks

We use Husky + lint-staged to keep quality high:

- On commit, staged files are auto-formatted and lint-fixed with Biome.
- To bypass in emergencies: `git commit --no-verify` (avoid for normal work).

## Code Quality

- Lint report: `bun run lint`
- Format write/check: `bun run format` / `bun run format:check`
- One-shot check/fix: `bun run check` / `bun run check:write`
- Organize imports: `bun run imports:organize`
- Logging (Convex only): use `log.*` from `convex/lib/logger` — `console.*` is lint-blocked in `convex/**` (except `convex/lib/logger.ts`).

### Code Style (Biome enforced)

- 2 spaces, 80 char line width, double quotes, semicolons.
- Import aliases: `@/*` (src), `@convex/*` (convex), `@shared/*` (shared).
- Naming: camelCase (functions/vars), PascalCase (components/types), CONSTANT_CASE (constants).
- TypeScript: strict types, avoid `any`, prefer `type` imports, optional chaining, exhaustive deps.
- React: self-closing elements, fragment syntax `<>`, avoid array index keys.
- A11y: follow rules surfaced by Biome; fix or justify warnings in PRs.

## CI

- GitHub Actions workflow `.github/workflows/ci.yml` runs Biome and build checks on pushes and PRs
- Ensure lint passes and the app builds cleanly before opening PRs

## Commit Style

- Keep commits focused and descriptive
- Reference issues where applicable

Thanks again for contributing!
