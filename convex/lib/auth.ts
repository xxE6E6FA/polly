import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { type Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

/**
 * Get the current user's ID from the authentication context.
 * Returns null if the user is not authenticated.
 * @param ctx
 */
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

/**
 * Get the current user's ID or throw an error if not authenticated.
 * Use this when authentication is required for the operation.
 * @param ctx
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users">> {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }
  return userId;
}

/**
 * Get the current session ID from the authentication context.
 * Returns null if there is no active session.
 * @param ctx
 */
export async function getCurrentSessionId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"authSessions"> | null> {
  return await getAuthSessionId(ctx);
}

/**
 * Get the current session ID or throw an error if not authenticated.
 * @param ctx
 */
export async function requireSession(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"authSessions">> {
  const sessionId = await getCurrentSessionId(ctx);
  if (!sessionId) {
    throw new ConvexError("Active session required");
  }
  return sessionId;
}

/**
 * Get the current user document from the database.
 * Returns null if the user is not authenticated or not found.
 * @param ctx
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    return null;
  }

  return await ctx.db.get(userId);
}

/**
 * Get the current user document or throw an error if not authenticated.
 * @param ctx
 */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new ConvexError("User not found");
  }

  return user;
}

/**
 * Get the current session document from the database.
 * Returns null if there is no active session.
 * @param ctx
 */
export async function getCurrentSession(ctx: QueryCtx | MutationCtx) {
  const sessionId = await getCurrentSessionId(ctx);
  if (!sessionId) {
    return null;
  }

  return await ctx.db.get(sessionId);
}

/**
 * Check if the current user has a specific role or permission.
 * This is a placeholder - implement based on your user schema.
 * @param ctx
 * @param _permission
 */
export async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  _permission: string
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    return false;
  }

  // TODO: Implement your permission logic here
  // Example: return user.roles?.includes(permission) ?? false;
  return true;
}

/**
 * Require that the current user has a specific permission.
 * Throws an error if the user doesn't have the permission.
 * @param ctx
 * @param permission
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: string
): Promise<void> {
  const hasAccess = await hasPermission(ctx, permission);
  if (!hasAccess) {
    throw new ConvexError(`Permission denied: ${permission}`);
  }
}

/**
 * Check if the current user is the owner of a resource.
 * This is a generic helper that can be used for any resource with a userId field.
 * @param ctx
 * @param resource
 */
export async function isOwner<T extends { userId?: Id<"users"> }>(
  ctx: QueryCtx | MutationCtx,
  resource: T | null
): Promise<boolean> {
  if (!resource || !resource.userId) {
    return false;
  }

  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    return false;
  }

  return resource.userId === userId;
}

/**
 * Require that the current user is the owner of a resource.
 * Throws an error if the user is not the owner.
 * @param ctx
 * @param resource
 * @param resourceName
 */
export async function requireOwnership<T extends { userId?: Id<"users"> }>(
  ctx: QueryCtx | MutationCtx,
  resource: T | null,
  resourceName = "resource"
): Promise<void> {
  const isResourceOwner = await isOwner(ctx, resource);
  if (!isResourceOwner) {
    throw new ConvexError(
      `You don't have permission to access this ${resourceName}`
    );
  }
}

/**
 * Get user by ID with proper error handling.
 * Returns null if user doesn't exist.
 * @param ctx
 * @param userId
 */
export async function getUserById(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
) {
  try {
    return await ctx.db.get(userId);
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Get all active sessions for a user.
 * Useful for session management features.
 * @param ctx
 * @param userId
 */
export async function getUserSessions(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
) {
  return await ctx.db
    .query("authSessions")
    .withIndex("userId", q => q.eq("userId", userId))
    .collect();
}

/**
 * Check if the current request is from an anonymous user.
 * Returns true if the user exists and is marked as anonymous.
 * @param ctx
 */
export async function isAnonymousUser(
  ctx: QueryCtx | MutationCtx
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return user?.isAnonymous ?? false;
}

/**
 * Require that the current user is not anonymous.
 * Throws an error if the user is anonymous or not authenticated.
 * @param ctx
 */
export async function requireNonAnonymousUser(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.isAnonymous) {
    throw new ConvexError("This action requires a registered account");
  }
  return user;
}

// Legacy function for backward compatibility

export async function getOptionalUserId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users"> | null> {
  return await getCurrentUserId(ctx);
}
