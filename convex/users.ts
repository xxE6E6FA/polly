import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export { handleCreateAnonymousUser } from "./lib/user/mutation_handlers";
// Re-export handler functions for tests
export {
  currentHandler,
  getMessageSentCountHandler,
  handleGetUserById,
} from "./lib/user/query_handlers";

import {
  deleteAccountHandler,
  graduateAnonymousUserHandler,
  handleCreateAnonymousUser,
  incrementMessageHandler,
  internalPatchHandler,
  updateProfileHandler,
} from "./lib/user/mutation_handlers";
import {
  currentHandler,
  getMessageSentCountHandler,
  handleGetUserById,
} from "./lib/user/query_handlers";

export const current = query({
  args: {},
  handler: currentHandler,
});

// Internal version for system operations
export const internalCreateAnonymous = internalMutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

export const createAnonymous = mutation({
  args: {},
  handler: handleCreateAnonymousUser,
});

export const incrementMessage = mutation({
  args: {
    userId: v.id("users"),
    model: v.string(),
    provider: v.string(),
    tokensUsed: v.optional(v.number()),
    countTowardsMonthly: v.optional(v.boolean()),
  },
  handler: incrementMessageHandler,
});

export const graduateAnonymousUser = mutation({
  args: {
    anonymousUserId: v.id("users"),
    newUserId: v.id("users"),
  },
  handler: graduateAnonymousUserHandler,
});

export const getById = query({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

/**
 * Internal mutation for system operations only.
 * This is NOT exposed to clients - use updateProfile for user-facing updates.
 */
export const internalPatch = internalMutation({
  args: {
    id: v.id("users"),
    updates: v.any(),
  },
  handler: internalPatchHandler,
});

export const internalGetById = internalQuery({
  args: { id: v.id("users") },
  handler: (ctx, args) => handleGetUserById(ctx, args.id),
});

export const getMessageSentCount = query({
  args: {},
  handler: getMessageSentCountHandler,
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: updateProfileHandler,
});

export const deleteAccount = mutation({
  args: {},
  handler: deleteAccountHandler,
});
