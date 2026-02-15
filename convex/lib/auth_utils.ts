import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Shared authentication and user validation utilities
 */

// Get authenticated user with consistent error handling
export async function getAuthenticatedUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("User not authenticated");
  }
  return userId;
}

// Get authenticated user and user data in one call
export async function getAuthenticatedUserWithData(
  ctx: MutationCtx | QueryCtx,
): Promise<{
  userId: Id<"users">;
  user: Doc<"users">;
}> {
  const userId = await getAuthenticatedUser(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError("User not found");
  }
  return { userId, user };
}

// Get authenticated user and user data for actions (uses runQuery)
export async function getAuthenticatedUserWithDataForAction(
  ctx: ActionCtx,
): Promise<{
  userId: Id<"users">;
  user: Doc<"users">;
}> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("User not authenticated");
  }
  const user = await ctx.runQuery(api.users.current, {});
  if (!user) {
    throw new ConvexError("User not found");
  }
  return { userId, user };
}

// Validate user authentication and return user data
export async function validateAuthenticatedUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthenticatedUser(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError("User not found");
  }
  return user;
}
