# Contributing to Polly

Thanks for your interest in contributing! This doc outlines how to set up and submit changes.

## Development Setup

- Bun (latest) + Node 20.x (for Convex compatibility)
- Install deps: `bun install` (or use `mise install` if using mise)
- Start backend (terminal A): `npx convex dev`
- Start frontend (terminal B): `bun run dev`

## Testing

We use Bun's built-in runner and React Testing Library for DOM tests.

- Install test deps once:
  - `bun add -d @testing-library/react @testing-library/jest-dom @happy-dom/global-registrator convex-test`
- Run all tests: `bun test`
- Watch mode: `bun test --watch`
- Single file: `bun test path/to/file.test.tsx`
- Randomized order (reproducible): `bun test --randomize --seed 1234`
- CI uses: `bun test --randomize --coverage --bail`

### Test Isolation & Flakiness Prevention

To prevent flaky tests caused by shared state and global mocks:

- **Store Isolation**: For tests using Zustand stores (e.g., `chat-input-store`):
  ```typescript
  beforeEach(() => {
    mock.restore(); // Clear global mocks first
    setChatInputStoreApi(createChatInputStore()); // Fresh store instance
    // ... other setup
  });

  afterAll(() => {
    setChatInputStoreApi(originalStore); // Restore original store
  });
  ```

- **Mock Cleanup**: Always call `mock.restore()` in `beforeEach` to clear global mocks between tests.

- **Avoid Global Hook Mocking**: Instead of mocking hooks globally (e.g., `mock.module("@/hooks/useSelectedModel", ...)`), prefer setting up store state directly:
  ```typescript
  beforeEach(() => {
    resetChatInputStoreApi();
    getChatInputStore().setState({ selectedModel: testModel });
  });
  ```

- **Test Seeds**: When tests fail, note the failing seed and use it to reproduce: `bun test --seed 12345`

Notes:
- DOM environment is provided by happy‑dom via `test/setup-bun.ts` (loaded automatically).
- For components/hooks that import `convex/react`, prefer module‑level mocks in the test file.
- For server functions under `convex/`, use the official `convex-test` utilities.

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

We follow [Conventional Commits](https://www.conventionalcommits.org/) for consistency:

- **Format**: `<type>: <description>`
- **Types**: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`, `perf`, `ci`, `build`, `revert`
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

Thanks again for contributing!
