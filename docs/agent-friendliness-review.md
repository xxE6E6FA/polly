# Agent-Friendliness Review: Polly Codebase

**Date**: 2026-02-14
**Codebase**: 525 TypeScript files, ~122,000 lines of code
**Stack**: React 19 + Convex + Vite + Vercel AI SDK

---

## Overall Rating: 7.0 / 10

Polly is **above average** for agent-friendliness. The CLAUDE.md is well-structured and concise (126 lines), the project has consistent naming conventions (kebab-case everywhere), JSDoc in barrel files, a clear directory structure, and good test coverage (87 test files, 16.6% ratio). These are meaningful strengths.

However, several high-impact issues remain. The codebase has multiple files exceeding 2,000 lines, lacks targeted testing instructions, provides no domain glossary, has no progressive context disclosure (`.claude/rules/`), contradicts its own instructions in its permissions config, and is missing the cross-tool AGENTS.md standard. Each of these directly degrades agent performance by wasting context tokens, increasing hallucination risk, or causing the agent to make wrong assumptions.

The recommendations below are ordered by estimated impact on agent efficiency.

---

## Top 10 Recommendations

### 1. Split Oversized Backend Files (Highest Impact)

**Problem**: Several files dramatically exceed the 500-line sweet spot for agent comprehension. Research shows agents lose coherence above ~2,000 lines (Ben Houston, 2025), and these files are well beyond that:

| File | Lines | Recommendation |
|---|---|---|
| `convex/conversations.ts` | 2,908 | Split into queries, mutations, actions, helpers |
| `convex/messages.ts` | 2,741 | Split into CRUD, streaming, branching, search |
| `convex/imageModels.ts` | 1,470 | Split definitions from operations |
| `convex/ai/replicate.ts` | 1,390 | Split API calls from image processing |
| `convex/ai/elevenlabs.ts` | 1,246 | Split TTS generation from voice management |
| `convex/fileStorage.ts` | 1,038 | Split upload from query/deletion |
| `convex/lib/schemas.ts` | 975 | Split by domain (user, conversation, message, jobs) |
| `src/components/navigation/command-palette.tsx` | 1,406 | Extract command groups into separate files |

When an agent needs to modify a 2,908-line file, it must read and hold the entire file in context, consuming thousands of tokens before it can make a single change. The arXiv:2601.20404 study found AGENTS.md alone reduces runtime by 28.6% — splitting files delivers a similar or larger effect because the agent reads fewer irrelevant lines on every operation.

**Target**: No file exceeds 500 lines. Convex supports multiple files exporting from the same module path.

---

### 2. Add `.claude/rules/` for Progressive Context Disclosure

**Problem**: The current CLAUDE.md is loaded into context for *every* agent interaction, regardless of whether the agent is working on the Convex backend, React frontend, styling, or tests. This wastes context tokens on irrelevant information.

**Solution**: Split domain-specific instructions into `.claude/rules/` files that are loaded only when relevant:

```
.claude/
└── rules/
    ├── convex.md           # Convex patterns, schema rules, index requirements
    ├── react-patterns.md   # React 19 patterns, compiler rules, hook conventions
    ├── styling.md          # Tailwind tokens, stack-* spacing, z-index classes
    ├── testing.md          # How to run tests, test patterns, test file naming
    ├── ai-integration.md   # AI SDK patterns, provider setup, streaming
    └── code-review.md      # PR review rules (currently in CLAUDE.md)
```

Keep the root CLAUDE.md lean (under 80 lines): commands, stack overview, project structure, and file naming. Move everything else into rules files. Claude Code loads matching rules automatically based on file globs.

Research supports this: Anthropic's own evaluation found their manually-written 85-line CLAUDE.md outperformed an auto-generated 280-line version. Shorter root instructions with progressive disclosure is the documented best practice.

---

### 3. Add Targeted Testing Instructions

**Problem**: The CLAUDE.md says `bun run test` but doesn't explain how to run a single test file or a single test case. Agents default to running the entire test suite, which is slow and produces overwhelming output.

**Solution**: Add to CLAUDE.md or `.claude/rules/testing.md`:

```markdown
## Testing

bun run test                              # Run all tests
bun test <path>                           # Run single file: bun test convex/conversations.test.ts
bun test --grep "pattern"                 # Run matching tests
bun test --timeout 30000 <path>           # For slow tests (AI integration)

### Test file conventions
- Co-locate tests: `foo.ts` → `foo.test.ts` (same directory)
- Convex tests use convex-test helpers from `convex-test`
- Frontend tests use React Testing Library
- Shared tests are pure unit tests

### After making changes
1. Run the specific test file for what you changed
2. Run `bun run check` for full verification (lint + types + build)
3. Never run `bun run test` for all tests unless specifically asked
```

The research consensus is strong here: Simon Willison's observation that test suites give agents "superpowers" is only true when the agent can run *targeted* tests quickly, not the entire suite.

---

### 4. Add a Domain Glossary and Architecture Decision Context

**Problem**: Agents lack business context. When an agent sees `sourceConversationId`, `branchId`, `rootConversationId`, `activeForkDefaultBranchId`, and `parentConversationId` in the conversation schema, it has no way to understand the branching model without reading thousands of lines of implementation code.

**Solution**: Add a glossary to CLAUDE.md or a dedicated `.claude/rules/domain.md`:

```markdown
## Domain Concepts

- **Conversation**: A chat thread. Has messages, belongs to a user. Can be branched.
- **Branch**: A fork from a message in a conversation. Creates a new conversation with
  `parentConversationId` pointing to the source. All branches share a `branchId` (UUID).
  The `rootConversationId` points to the original ancestor conversation.
- **Persona**: A system prompt template with optional sampling parameters. Can be built-in
  (global) or user-created. Persona name/icon are snapshotted onto messages at creation time.
- **Streaming**: AI responses stream via Convex actions. The conversation tracks
  `currentStreamingMessageId` and `stopRequested` to coordinate stop/start.
- **Private Mode**: Client-side-only AI calls using user's own API keys. No server-side
  storage. Uses `usePrivateChat` hook.
- **Hydrated Model**: A model document enriched with capabilities from the `modelsDevCache`
  table. The base model is just {modelId, name, provider}; capabilities are resolved at
  query time.
- **Background Job**: Long-running operations (export, import, bulk delete) tracked via the
  `backgroundJobs` table with status/progress polling.
```

This pays for itself immediately. Without it, agents must read `convex/conversations.ts` (2,908 lines) and `convex/messages.ts` (2,741 lines) just to understand basic concepts before making changes.

---

### 5. Fix the Permissions / Instructions Contradiction

**Problem**: The CLAUDE.md says "Always use `bun` — never npm, pnpm, or npx." But `.claude/settings.local.json` has 30+ permissions for `npm`, `pnpm`, `npx`, and `pntml` (a typo). This is confusing for agents and erodes trust in the instructions.

```json
// Current .claude/settings.local.json includes:
"Bash(npm install:*)",
"Bash(npx convex dev:*)",
"Bash(pnpm lint:*)",
"Bash(pnpm check:*)",
"Bash(pntml lint:*)",    // typo
"Bash(pntml test:*)",    // typo
```

**Solution**: Clean up `.claude/settings.local.json` to match the documented instructions. Remove all `npm`, `pnpm`, `npx`, and `pntml` permissions. Keep only `bun` and `bunx` variants. This takes 5 minutes but removes a source of agent confusion on every session.

---

### 6. Add an AGENTS.md for Cross-Tool Compatibility

**Problem**: Polly has a CLAUDE.md but no AGENTS.md. The AGENTS.md standard (adopted by 60,000+ projects) is supported by Claude Code, Cursor, Copilot, Windsurf, Gemini CLI, and Devin. Without it, other tools get zero guidance.

**Evidence**: arXiv:2601.20404 (Jan 2026) studied 10 repos and 124 PRs and found AGENTS.md reduces agent runtime by **28.64%** and token consumption by **16.58%** with equivalent task completion rates.

**Solution**: Create an `AGENTS.md` that mirrors the essential parts of CLAUDE.md (commands, structure, conventions). This is a superset play — agents that support AGENTS.md get the guidance; Claude Code uses its own CLAUDE.md which can go deeper.

---

### 7. Reduce Barrel File Indirection with Direct Import Comments

**Problem**: The codebase uses barrel files extensively (`@/hooks`, `@/lib`, `@/components/ui`). While these provide clean import paths for humans, they create an indirection layer for agents. When an agent sees `import { useChat } from "@/hooks"`, it must open `hooks/index.ts` (126 lines) to find which file actually contains `useChat`, then open that file. For 70 UI components re-exported through a single barrel, this is expensive.

Research from Armin Ronacher (Flask creator): "Agents often struggle to understand barrel files... A one-to-one mapping from where something is declared to where it's imported from is great."

**Solution**: Don't remove barrel files (they serve humans too), but add direct-path comments in the barrel file exports:

```typescript
// hooks/index.ts
export { useChat } from "./use-chat";          // src/hooks/use-chat.ts (480 lines)
export { useSelectedModel } from "./use-selected-model"; // src/hooks/use-selected-model.ts (85 lines)
```

This lets agents see file sizes and paths without opening each file. Alternatively, add a section to CLAUDE.md mapping key hooks/utilities to their implementation files.

---

### 8. Add Convex-Specific Patterns to Agent Instructions

**Problem**: Convex has unique patterns (optimistic updates, validators, server-side vs client-side, OCC retry patterns, index requirements) that agents frequently get wrong. The CLAUDE.md mentions "Incorrect Convex patterns" as a code review flag but never explains what the correct patterns are.

**Solution**: Create `.claude/rules/convex.md`:

```markdown
## Convex Patterns

### Queries vs Mutations vs Actions
- **Queries**: Read-only, cached, reactive. Use for all reads.
- **Mutations**: Read-write, transactional. Use for data changes.
- **Actions**: Can call external APIs, not transactional. Use for AI calls, webhooks.
- Actions cannot read/write DB directly — call internal mutations/queries.

### Index Requirements
- Every `.filter()` in a query MUST have a matching index in schema.ts
- Index field order matters — put equality filters first, range filters last
- Use `.withIndex("name", q => q.eq("field", value))` not `.filter()`

### Error Handling
- Use `ConvexError` for user-facing errors (shown in UI)
- Use `console.error` for logging (no custom loggers)
- Use `withRetry` wrapper for external API calls (from ai/error_handlers.ts)

### Auth Pattern
- Always call `getAuthUserId(ctx)` and check for null
- Access patterns use `checkConversationAccess` / `validateConversationAccess`
- Never trust client-provided userId — always derive from auth

### Schema Changes
- Edit `convex/lib/schemas.ts` for schema changes
- Add indexes in `convex/schema.ts`
- Run `bun run typecheck` to verify schema/code alignment
```

---

### 9. Reduce Type Definition Duplication Between Frontend and Backend

**Problem**: Types are defined in three overlapping places:
- `src/types/index.ts` (520 lines) — Frontend TypeScript types
- `convex/lib/schemas.ts` (975 lines) — Convex validator schemas
- `shared/` (25 files) — Shared utilities with their own type definitions

For example, `Attachment` is defined as a TypeScript type in `src/types/index.ts:252-280` AND as a Convex validator schema in `convex/lib/schemas.ts:154-186`. When an agent modifies one, it doesn't know to update the other. This is a guaranteed source of bugs.

**Solution**: Use Convex's `Infer<>` utility (already partially used in `schemas.ts:958-975`) to derive frontend types from the Convex schemas. Move the canonical type definitions to `shared/` and generate the rest:

```typescript
// shared/types.ts (single source of truth)
import type { Infer } from "convex/values";
import { attachmentSchema } from "../convex/lib/schemas";

export type Attachment = Infer<typeof attachmentSchema>;
```

This eliminates a class of errors where the agent updates one definition but not its mirror.

---

### 10. Add a Gotchas / Common Mistakes Section

**Problem**: Every codebase has traps that even experienced developers fall into. Agents hit these traps repeatedly because they lack institutional memory. The CLAUDE.md has no "gotchas" or "never do" section.

**Solution**: Add a `## Gotchas` section to CLAUDE.md:

```markdown
## Gotchas

- **Streaming race conditions**: Never modify `isStreaming` directly on conversations.
  Use `currentStreamingMessageId` to coordinate. The streaming action's finally block
  only clears isStreaming if its messageId matches this field.
- **OCC (Optimistic Concurrency Control)**: Convex mutations retry on conflict.
  Mutations must be idempotent. See `write-conflict-mutations.test.ts` for patterns.
- **Base UI render prop**: Base UI uses `render` prop to customize elements, NOT
  `asChild` (which is Radix). Getting this wrong causes silent rendering failures.
- **Stack spacing**: Use `stack-xs/sm/md/lg` (custom utility), NOT `space-y-*`
  (Tailwind default). They look similar but behave differently.
- **Model capabilities are NOT stored on models**: The `userModels` and `builtInModels`
  tables store only {modelId, name, provider}. Capabilities come from the
  `modelsDevCache` table and are hydrated at query time. Never add capability fields
  to model mutations.
- **React Router v7 params**: Route params may be undefined. Always handle
  the undefined case: `const { id } = useParams<{ id: string }>()`.
- **Convex file deletion**: Always verify ownership before deleting userFiles entries.
  See the IMPORTANT comment in schemas.ts userFileSchema.
```

Research from the Martin Fowler / Birgitta Böckeler article: the highest-value CLAUDE.md content is information the agent "couldn't discover on its own" — gotchas, tribal knowledge, and non-obvious constraints.

---

## Honorable Mentions

These didn't make the top 10 but are worth tracking:

- **Add `SessionStart` hook** for web sessions to auto-run `bun install` and verify the environment
- **Split large test files** (e.g., `userModels.test.ts` at 2,630 lines) — agents reading tests for context hit the same file-size problems
- **Add inline schema comments** in `convex/schema.ts` explaining why each index exists (agents frequently add redundant indexes or miss required ones)
- **Create a `CONTRIBUTING.md` for agents** — the existing one is human-oriented; an agent-oriented version would specify the exact PR workflow, branch naming, and verification steps
- **Consider `biome.json` as the single source of truth for style** — remove all style guidance from CLAUDE.md (the research says "never send an LLM to do a linter's job") and replace with: "Run `bun run fix` before committing. Biome handles all formatting and linting."

---

## Scoring Breakdown

| Dimension | Score | Notes |
|---|---|---|
| Instruction file quality | 7/10 | Good CLAUDE.md but missing domain glossary, gotchas, testing instructions |
| File size discipline | 4/10 | Multiple 1,000-2,900 line files; 11 files exceed 800 lines |
| Code organization | 8/10 | Clean separation, consistent naming, good barrel files with JSDoc |
| Test infrastructure | 6/10 | Good coverage ratio but no docs on running targeted tests; some giant test files |
| Type safety & schema design | 7/10 | Strong typing but duplication across frontend/backend definitions |
| Documentation for agents | 5/10 | No domain glossary, no gotchas, no architecture decisions, no AGENTS.md |
| Progressive disclosure | 3/10 | Everything in one CLAUDE.md; no `.claude/rules/` usage |
| Tool/command ergonomics | 7/10 | Good scripts but permissions contradict instructions |
| Cross-tool support | 3/10 | CLAUDE.md only; no AGENTS.md, no .cursorrules |
| Consistency & predictability | 8/10 | Kebab-case everywhere, consistent patterns, few surprises |

---

## References

- [arXiv:2601.20404 — Impact of AGENTS.md on Agent Efficiency](https://arxiv.org/abs/2601.20404) (28.64% runtime reduction)
- [Anthropic: Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Ben Houston: Agentic Coding Best Practices](https://benhouston3d.com/blog/agentic-coding-best-practices) (150-500 line sweet spot)
- [Armin Ronacher: Agentic Coding Recommendations](https://lucumr.pocoo.org/2025/6/12/agentic-coding/) (barrel file problems, local reasoning)
- [Martin Fowler / Birgitta Böckeler: Context Engineering for Coding Agents](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
- [Addy Osmani: How to Write a Good Spec for AI Agents](https://addyosmani.com/blog/good-spec/)
- [AGENTS.md Specification](https://agents.md/) (60,000+ projects)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [arXiv:2511.09268 — Analysis of 328 CLAUDE.md Files](https://arxiv.org/abs/2511.09268)
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
