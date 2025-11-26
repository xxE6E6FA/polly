# Agent Guidelines for Polly

## Build/Lint/Test Commands

- **Build**: `bun run build` (includes Convex deploy)
- **Dev**: `bun run dev` (includes backend + frontend)
- **Fix**: `bun run fix` (auto-fixes formatting, linting, and organizes imports)
- **Check**: `bun run check` (verifies everything: lint + format + typecheck + compiler health + build)
- **Test**: `bun run test` (all tests) or `bun test <file>` (specific file)
  - For deterministic results: `bun test --seed=3080887667`
  - Individual test files have 100% pass rate
  - Full suite: 99.5% pass rate (1-6 failures due to global store race conditions)
  - Tests run in parallel across files for speed
  - Use `bun test --seed=<number>` for deterministic results
  - If a seeded run (e.g., `bun test --seed=1198959309`) fails, look for cross-file pollution from shared module mocks or singleton stores. Prefer rendering against real providers/stores with helpers instead of `mock.module()` overrides in test files.
  - Zustand stores auto-reset after each test via `resetVanillaStores()` and `resetReactStores()` in `test/setup-bun.ts`; leave those helpers in place and avoid custom store resets unless a test needs a bespoke store instance.
  - **Store method binding**: When implementing store hooks with `Object.assign`, methods MUST use dynamic access (arrow functions that call `storeApi.method()`), not static binding (`.bind()` or direct assignment), to support test isolation via `setStoreApi()`.
- **Watch mode**: `bun run test:watch` (run tests in watch mode)

## Code Style (Biome enforced)

### Formatting Rules

- **Indentation**: 2 spaces (never tabs)
- **Line Width**: 80 characters maximum
- **Quotes**: Double quotes for strings and JSX attributes
- **Semicolons**: Always required
- **Trailing Commas**: ES5 style (all except function parameters)
- **Arrow Parentheses**: As needed (omit for single parameter)
- **Bracket Spacing**: Always enabled `{ foo }` not `{foo}`

### Import Organization

- **Aliases**: Use `@/` for src imports
- **Auto-organize**: Biome automatically organizes imports on save/fix
- **Type Imports**: Use `import type` for type-only imports (`useImportType` rule)
- **Export Types**: Use `export type` for type-only exports (`useExportType` rule)
- Order: External packages → Internal aliases → Relative imports

### Naming Conventions

- **Functions/Variables**: camelCase (`getUserData`, `isLoading`)
- **React Components**: PascalCase (`UserProfile`, `ChatHeader`)
- **Types/Interfaces**: PascalCase (`User`, `ConversationId`)
- **Constants**: CONSTANT_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- **Files**: kebab-case for components (`chat-header.tsx`), camelCase for utilities

### React/JSX Rules

- **Components**: Must be PascalCase
- **Self-Closing**: Always use self-closing for elements without children (`<Button />`)
- **Fragment Syntax**: Use `<>...</>` instead of `<Fragment>...</Fragment>`
- **No Array Index Keys**: Never use array index as key in `map()`
- **No Children Prop**: Use children composition, not `children` prop
- **Exhaustive Dependencies**: All useEffect/useMemo/useCallback dependencies must be declared

### React Compiler & Memoization

- **React Compiler Enabled**: 353/353 components successfully compiled
- **Default to No Memoization**: Let React Compiler handle optimization automatically
- **Avoid Over-Memoization**: Don't use `useMemo`/`useCallback` for trivial operations
- **Profile First**: Use React DevTools Profiler before adding manual optimizations
- **Keep Legitimate Optimizations**: Preserve memoization for expensive computations, virtualization, provider contexts, and public hook APIs

### TypeScript Rules

- **No `any`**: Use proper typing or `unknown` with type guards (`noExplicitAny` enforced)
- **Type Imports**: Use `import type { Foo }` for types (`useImportType` enforced)
- **Optional Chaining**: Prefer `?.` over manual null checks (`useOptionalChain` enforced)
- **Const Assertions**: Use `as const` for literal types (`useAsConstAssertion` enforced)
- **No Non-Null Assertion**: Avoid `!` operator (warning only)
- **No Namespace**: Use ES modules, not namespaces
- **Array Literals**: Use `[]` not `new Array()` or `Array()`

### Control Flow & Logic

- **No Nested Ternaries**: Forbidden by `noNestedTernary` rule - use if/else or helper functions
- **Use Block Statements**: Always use `{}` for if/else/while bodies (`useBlockStatements` enforced)
- **No Useless Else**: Remove else after return/throw (`noUselessElse` enforced)
- **Use Template Literals**: Prefer `` `${x}` `` over `"" + x` (`useTemplate` enforced)
- **Use Optional Chain**: Prefer `a?.b?.c` over `a && a.b && a.b.c` (`useOptionalChain` enforced)

### Common Pitfalls to Avoid

- **No `==`**: Always use `===` (`noDoubleEquals` enforced)
- **No Console**: Use `log.*` from `convex/lib/logger` in backend (console allowed in scripts only)
- **No Unused Variables**: All declared variables must be used (`noUnusedVariables` enforced)
- **No Empty Blocks**: Empty `{}` blocks are forbidden (`noEmptyBlock` enforced)
- **No Debugger**: Remove `debugger` statements (`noDebugger` enforced)
- **No Parameter Reassign**: Don't reassign function parameters (`noParameterAssign` enforced)

### Running Biome

- **Fix All**: `bun run fix` (auto-fixes formatting, linting, organizes imports)
- **Check Only**: `bunx biome check <file>` (shows issues without fixing)
- **Specific File**: `bunx biome check --write <file>` (fix specific file)
- **CI/CD**: `bunx biome ci .` (strict check for CI, fails on errors)

## React Compiler & Performance Best Practices

### Memoization Guidelines

**✅ Keep Memoization For:**

- useEvent implementations (stable event handler pattern)
- Public hook API callbacks (consumer stability contracts)
- Virtualized components (performance-critical rendering)
- Provider contexts (app-wide re-render prevention)
- Expensive computations (profiler-verified >10ms operations)
- Set/Map creation for O(1) lookups in large datasets
- Functions used in other hook dependencies (prevents infinite re-renders)

**❌ Avoid Memoization For:**

- Simple boolean logic (`isEnabled = status === "active"`)
- Simple string operations (`displayName = user?.name || "Anonymous"`)
- Simple array operations (`items.filter(item => item.visible)`)
- Zero-dependency callbacks (`const handleClick = () => setOpen(true)`)
- Trivial object creation (`{ id, name }`)
- Simple className concatenation

**🔍 Before Adding Memoization:**

1. Profile with React DevTools Profiler to identify actual performance issues
2. Document reasoning with performance data
3. Verify the memoized value isn't used in other hook dependencies

### Examples

```typescript
// ✅ Good - Let React Compiler handle it
function UserCard({ user, onEdit }) {
  const displayName = user?.name || "Anonymous";
  const isActive = user.status === "active";

  const handleEdit = () => {
    onEdit(user.id);
  };

  return <button onClick={handleEdit}>{displayName}</button>;
}

// ✅ Good - Legitimate memoization for virtualization
function ModelList({ models }) {
  const rows = useMemo(() => {
    const result = [];
    for (let i = 0; i < models.length; i += columnsPerRow) {
      result.push(models.slice(i, i + columnsPerRow));
    }
    return result;
  }, [models, columnsPerRow]);

  return <VirtualizedList rows={rows} />;
}

// ❌ Bad - Unnecessary memoization
function UserCard({ user }) {
  const displayName = useMemo(() => user?.name || "Anonymous", [user?.name]);
  const handleClick = useCallback(() => console.log("clicked"), []);

  return <div onClick={handleClick}>{displayName}</div>;
}
```

## Error Handling

- Use proper error boundaries and try/catch blocks
- For Convex backend, use `log.*` from `convex/lib/logger` instead of `console.*` (lint-blocked).
- Return user-friendly error messages; silently catch localStorage errors in browser.

## Architecture

- **Frontend**: React 19 + Bun bundler + TailwindCSS + Radix UI + React Router
- **Backend**: Convex (realtime database/functions, auth, file storage)
- **AI**: Multiple providers (Anthropic, OpenAI, Google, OpenRouter) via AI SDK
- **Key Data**: Users, conversations, messages, personas, API keys, background jobs
- **Streaming**: Real-time chat streamed over Convex HTTP actions

## Commits & Pull Requests

- **Format**: Use [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>: <description>`
- **Types**: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`, `perf`, `ci`, `build`, `revert`
- **Title Only**: Commit messages MUST contain only a title (no body/description)
- **Splitting**: Split commits when changes affect different areas or have different purposes
- **Branch Names**: Use `<type>/<description>` format (e.g., `feat/add-commit-rules`, `fix/message-flicker`)
- **PR Creation**: Use `gh pr create` CLI tool with concise, descriptive title (no Conventional Commits format required)
  ```bash
  gh pr create --title "Descriptive PR title" --body "PR description with context"
  ```
  If needed, specify head and base explicitly:
  ```bash
  gh pr create --head <branch-name> --base main --title "Descriptive PR title" --body "PR description"
  ```
- See `.cursor/rules/commits-and-prs.mdc` for detailed guidelines

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
- Z-Index: Use predefined utility classes for consistent layering (bottom to top):
  - `z-content` (0): Default content, background elements
  - `z-backdrop` (35): Mobile sidebar backdrop, overlay backdrops
  - `z-sidebar` (40): Sidebar components, chat header, navigation
  - `z-chat-input` (20): Chat input container, send buttons, overlays
  - `z-sticky` (30): Sticky elements, floating controls, copy buttons
  - `z-select` (40): Select dropdowns, status indicators
  - `z-popover` (50): Popover content, dropdown content, form suggestions
  - `z-drawer` (60): Drawer overlays, mobile navigation panels
  - `z-tooltip` (70): Tooltip content, help text overlays
  - `z-modal` (80): Dialog overlays, alert dialogs, zen mode
  - `z-command-palette` (90): Command palette, quick actions
  - `z-context-menu` (100): Context menus, right-click menus
  - Set z-index at primitive level when possible; never use arbitrary values like `z-[999]`
- Don'ts: Avoid `space-y-*` for sibling spacing, raw hex colors, ad-hoc shadows, inline styles for layout, and arbitrary z-index values.

### Density

- Wrap any container with `density-compact` to reduce vertical rhythm one step (e.g., `stack-lg` acts like `stack-md`).
- Wrap with `density-spacious` to increase rhythm one step (e.g., `stack-md` acts like `stack-lg`).
- Apply at page or section level depending on desired feel; leave default for general pages.

## VirtualizedDataList Component

Server-side paginated, virtualized list component at `src/components/data-list/VirtualizedDataList.tsx`.

### Key Props

- `query`: Convex paginated query reference
- `queryArgs`: Query args including `sortField`/`sortDirection` for server-side sorting
- `columns`: Column definitions with optional `sortable: true` and `sortField`
- `sort`: `{ field, direction, onSort }` for header sort indicators
- `variant`: `"contained"` (bordered) or `"flush"` (edge-to-edge)
- `stickyHeader`: Enable sticky column headers
- `stickyOffset`: Pixel offset for sticky header (e.g., 68 for settings nav)

### Server-side Sorting Pattern

```tsx
// 1. Add to Convex query handler
.order(args.sortDirection ?? "desc")

// 2. Add to query args schema
sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc")))

// 3. Frontend sort state
const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
const handleSort = (field: SortField) => {
  setSortDirection(prev => prev === "asc" ? "desc" : "asc");
};

// 4. Pass to VirtualizedDataList
<VirtualizedDataList
  queryArgs={{ sortDirection }}
  sort={{ field: sortField, direction: sortDirection, onSort: handleSort }}
  columns={[{ key: "date", sortable: true, sortField: "date", ... }]}
/>
```

### Features

- Window virtualization via `WindowVirtualizer` from virtua
- Headers always visible during loading (skeleton rows in body)
- Sort indicators (caret up/down) on sortable column headers
- Mobile-responsive with drawer actions via `mobileDrawerConfig`
- Selection support for bulk operations
