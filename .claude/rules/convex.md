---
globs: convex/**
---

# Convex Patterns

## Query / Mutation / Action
- **Query**: Read-only, reactive, deterministic. Can read DB directly.
- **Mutation**: Read + write DB. Must be deterministic (no fetch, no randomness unless `crypto`).
- **Action**: Can call external APIs, fetch, etc. **Cannot read/write DB directly** — must call mutations/queries via `ctx.runMutation()` / `ctx.runQuery()`.
- Internal functions (`internalQuery`, `internalMutation`, `internalAction`) are not exposed to the client.

## Indexes
- Always use `.withIndex("by_field", q => q.eq("field", value))` — never `.filter()` for indexed fields.
- Field order in compound indexes matters: the index `["userId", "conversationId"]` supports `eq("userId")` and `eq("userId").eq("conversationId")` but NOT `eq("conversationId")` alone.
- Define indexes in `convex/schema.ts`.

## Auth Pattern
```ts
const userId = await getAuthUserId(ctx);
if (!userId) { throw new Error("Not authenticated"); }
```
- For conversation access: use `checkConversationAccess(ctx, conversationId, userId)`.
- Always check ownership before mutations on user-owned resources.

## OCC (Optimistic Concurrency Control)
- Convex retries mutations automatically on OCC conflicts, but repeated failures will error.
- For mutations that touch hot documents (e.g., conversation during streaming), use `withRetry(fn, 5, 25)` from `convex/lib/utils.ts`.
- Keep mutations small and focused to reduce conflict surface.

## Schema Changes
- Edit schemas in `convex/lib/schemas.ts` — all schemas are defined and exported there.
- Add/modify indexes in `convex/schema.ts`.
- Use `v.optional()` for new fields to maintain backward compatibility with existing documents.
- Use `.extend()` for schema composition (e.g., `baseSchema.extend({ newField: v.string() })`).
