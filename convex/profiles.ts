import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { getAuthUserId } from "./lib/auth";
import { getAuthenticatedUser } from "./lib/shared_utils";

const MAX_PROFILES = 10;
const MAX_NAME_LENGTH = 50;
const DEFAULT_PROFILE_NAME = "Default";
const DEFAULT_PROFILE_ICON = "House";

// ============================================================================
// Internal helpers
// ============================================================================

async function ensureDefaultProfile(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Id<"profiles">> {
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_user_default", q =>
      q.eq("userId", userId).eq("isDefault", true)
    )
    .first();

  if (existing) {
    return existing._id;
  }

  const now = Date.now();
  return await ctx.db.insert("profiles", {
    userId,
    name: DEFAULT_PROFILE_NAME,
    icon: DEFAULT_PROFILE_ICON,
    isDefault: true,
    order: 0,
    createdAt: now,
    updatedAt: now,
  });
}

// ============================================================================
// Queries
// ============================================================================

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    // Sort by order then createdAt
    profiles.sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.createdAt - b.createdAt;
    });

    return profiles;
  },
});

export const get = query({
  args: { id: v.id("profiles") },
  handler: async (ctx: QueryCtx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const profile = await ctx.db.get(args.id);
    if (!profile || profile.userId !== userId) {
      return null;
    }

    return profile;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    // Validate name
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Profile name cannot be empty");
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `Profile name must be ${MAX_NAME_LENGTH} characters or less`
      );
    }

    // Check max profiles limit
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    if (existing.length >= MAX_PROFILES) {
      throw new Error(`Maximum of ${MAX_PROFILES} profiles allowed`);
    }

    // Auto-create default profile if none exist
    if (existing.length === 0) {
      await ensureDefaultProfile(ctx, userId);
    }

    // Calculate next order
    const maxOrder = existing.reduce(
      (max, p) => Math.max(max, p.order ?? 0),
      0
    );

    const now = Date.now();
    return await ctx.db.insert("profiles", {
      userId,
      name,
      icon: args.icon,
      isDefault: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("profiles"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    const profile = await ctx.db.get(args.id);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) {
        throw new Error("Profile name cannot be empty");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new Error(
          `Profile name must be ${MAX_NAME_LENGTH} characters or less`
        );
      }
      updates.name = name;
    }

    if (args.icon !== undefined) {
      updates.icon = args.icon;
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: {
    id: v.id("profiles"),
    moveConversationsToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx: MutationCtx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    const profile = await ctx.db.get(args.id);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }

    if (profile.isDefault) {
      throw new Error("Cannot delete the default profile");
    }

    // Move or delete conversations
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_profile_archived", q =>
        q.eq("userId", userId).eq("profileId", args.id)
      )
      .collect();

    if (args.moveConversationsToProfileId) {
      // Verify target profile exists and belongs to user
      const targetProfile = await ctx.db.get(args.moveConversationsToProfileId);
      if (!targetProfile || targetProfile.userId !== userId) {
        throw new Error("Target profile not found");
      }

      for (const conv of conversations) {
        await ctx.db.patch(conv._id, {
          profileId: args.moveConversationsToProfileId,
        });
      }
    }
    // If no move target specified, conversations keep their profileId
    // which now points to a deleted profile — they'll be orphaned.
    // The list handler treats profileId mismatches gracefully.

    // Clear activeProfileId if it points to the deleted profile
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (settings?.activeProfileId === args.id) {
      await ctx.db.patch(settings._id, {
        activeProfileId: undefined,
      });
    }

    await ctx.db.delete(args.id);
  },
});

export const setActive = mutation({
  args: {
    profileId: v.id("profiles"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    // Verify profile exists and belongs to user
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }

    // Upsert user settings
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (settings) {
      await ctx.db.patch(settings._id, {
        activeProfileId: args.profileId,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        activeProfileId: args.profileId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const moveConversations = mutation({
  args: {
    conversationIds: v.array(v.id("conversations")),
    targetProfileId: v.id("profiles"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const userId = await getAuthenticatedUser(ctx);

    // Verify target profile
    const targetProfile = await ctx.db.get(args.targetProfileId);
    if (!targetProfile || targetProfile.userId !== userId) {
      throw new Error("Target profile not found");
    }

    for (const convId of args.conversationIds) {
      const conv = await ctx.db.get(convId);
      if (!conv || conv.userId !== userId) {
        continue;
      }
      await ctx.db.patch(convId, {
        profileId: args.targetProfileId,
      });
    }
  },
});

// Internal mutation for auto-creating default profiles
export const internalEnsureDefaultProfile = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ensureDefaultProfile(ctx, args.userId);
  },
});
