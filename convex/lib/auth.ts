import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Drop-in replacement for `getAuthUserId` from `@convex-dev/auth/server`.
 *
 * Resolves the Clerk JWT identity → `externalId` → `Id<"users">`.
 * Same signature as the old function so all 32+ backend files only need
 * an import-path change.
 */
export async function getAuthUserId(
	ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<Id<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	const externalId = identity.subject;

	// Enforce issuer-based namespace separation: tokens from the anonymous
	// auth issuer must only resolve to anonymous users (externalId starts
	// with "anon_"). This prevents a compromised anonymous auth key from
	// being used to impersonate Clerk-authenticated users.
	const anonIssuer = process.env.ANON_AUTH_ISSUER;
	if (anonIssuer && identity.issuer === anonIssuer) {
		if (!externalId.startsWith("anon_")) {
			return null;
		}
	}

	// For queries/mutations we can use ctx.db directly.
	// For actions, ctx.db doesn't exist — use ctx.runQuery instead.
	if ("db" in ctx) {
		const user = await (ctx as QueryCtx).db
			.query("users")
			.withIndex("byExternalId", (q) => q.eq("externalId", externalId))
			.unique();
		return user?._id ?? null;
	}

	// Action context — no direct DB access, use internal query
	const userId = await (ctx as ActionCtx).runQuery(
		internal.users.internalGetByExternalId,
		{ externalId },
	);
	return userId;
}
