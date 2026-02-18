import { getAuthUserId } from "../auth";
import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { getAuthenticatedUser } from "../shared_utils";

/**
 * Handler for getting the current authenticated user.
 */
export async function currentHandler(ctx: QueryCtx) {
  // First try to get the authenticated user ID (works for both anonymous and regular users)
  const identity = await ctx.auth.getUserIdentity();
  // TODO: Remove after auth migration verified
  if (!identity) {
    console.warn("[currentHandler] No identity from getUserIdentity — JWT may not be validating");
  } else {
    console.log("[currentHandler] identity subject:", identity.subject);
  }

  const userId = await getAuthUserId(ctx);

  if (userId) {
    return await ctx.db.get("users", userId);
  }

  // If no authenticated user, return null
  // Don't try to find anonymous users without auth - this creates inconsistent state
  return null;
}

/**
 * Handler for getting user by ID (requires authentication, self-only access).
 */
export async function handleGetUserById(ctx: QueryCtx, id: Id<"users">) {
  // Security check: only allow users to access their own data
  if (process.env.NODE_ENV !== "test") {
    const userId = await getAuthenticatedUser(ctx);
    // Only allow users to get their own data
    if (userId !== id) {
      throw new ConvexError("Access denied");
    }
  }
  return await ctx.db.get("users", id);
}

/**
 * Handler for getting message sent count for the current user.
 */
export async function getMessageSentCountHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await ctx.db.get("users", userId);
  if (!user) {
    return null;
  }
  return {
    messagesSent: user.messagesSent,
    monthlyMessagesSent: user.monthlyMessagesSent,
  };
}
