import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getUserSettings = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    // Return defaults if no settings exist
    if (!settings) {
      return {
        userId,
        personasEnabled: true, // Default to enabled
        openRouterSorting: "default" as const, // Default to OpenRouter's load balancing
        anonymizeForDemo: false, // Default to disabled
        autoArchiveEnabled: false, // Default to disabled
        autoArchiveDays: 30, // Default to 30 days
        ttsUseAudioTags: true,
        ttsStabilityMode: "creative" as const,
        ttsVoiceId: undefined,
        ttsModelId: "eleven_v3",
      };
    }

    return {
      userId,
      personasEnabled: settings.personasEnabled ?? true, // Default to enabled if null/undefined
      openRouterSorting: settings.openRouterSorting ?? ("default" as const), // Default to load balancing
      anonymizeForDemo: settings.anonymizeForDemo ?? false, // Default to disabled
      autoArchiveEnabled: settings.autoArchiveEnabled ?? false, // Default to disabled
      autoArchiveDays: settings.autoArchiveDays ?? 30, // Default to 30 days
      ttsUseAudioTags: settings.ttsUseAudioTags ?? true,
      ttsStabilityMode: settings.ttsStabilityMode ?? ("creative" as const),
      ttsVoiceId: settings.ttsVoiceId,
      ttsModelId: settings.ttsModelId ?? "eleven_v3",
    };
  },
});

export const updateUserSettings = mutation({
  args: {
    personasEnabled: v.optional(v.boolean()),
    openRouterSorting: v.optional(
      v.union(
        v.literal("default"),
        v.literal("price"),
        v.literal("throughput"),
        v.literal("latency")
      )
    ),
    anonymizeForDemo: v.optional(v.boolean()),
    autoArchiveEnabled: v.optional(v.boolean()),
    autoArchiveDays: v.optional(v.number()),
    ttsVoiceId: v.optional(v.string()),
    ttsModelId: v.optional(v.string()),
    ttsUseAudioTags: v.optional(v.boolean()),
    ttsStabilityMode: v.optional(
      v.union(v.literal("creative"), v.literal("natural"), v.literal("robust"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existingSettings) {
      // Update existing settings
      await ctx.db.patch(existingSettings._id, {
        ...(args.personasEnabled !== undefined && {
          personasEnabled: args.personasEnabled,
        }),
        ...(args.openRouterSorting !== undefined && {
          openRouterSorting: args.openRouterSorting,
        }),
        ...(args.anonymizeForDemo !== undefined && {
          anonymizeForDemo: args.anonymizeForDemo,
        }),
        ...(args.autoArchiveEnabled !== undefined && {
          autoArchiveEnabled: args.autoArchiveEnabled,
        }),
        ...(args.autoArchiveDays !== undefined && {
          autoArchiveDays: args.autoArchiveDays,
        }),
        ...(args.ttsVoiceId !== undefined && { ttsVoiceId: args.ttsVoiceId }),
        ...(args.ttsModelId !== undefined && { ttsModelId: args.ttsModelId }),
        ...(args.ttsUseAudioTags !== undefined && {
          ttsUseAudioTags: args.ttsUseAudioTags,
        }),
        ...(args.ttsStabilityMode !== undefined && {
          ttsStabilityMode: args.ttsStabilityMode,
        }),
        updatedAt: now,
      });
    } else {
      // Create new settings
      await ctx.db.insert("userSettings", {
        userId,
        personasEnabled: args.personasEnabled ?? true,
        openRouterSorting: args.openRouterSorting ?? "default",
        anonymizeForDemo: args.anonymizeForDemo ?? false,
        autoArchiveEnabled: args.autoArchiveEnabled ?? false,
        autoArchiveDays: args.autoArchiveDays ?? 30,
        ttsVoiceId: args.ttsVoiceId,
        ttsModelId: args.ttsModelId,
        ttsUseAudioTags: args.ttsUseAudioTags ?? true,
        ttsStabilityMode: args.ttsStabilityMode ?? "creative",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

export const getUserSettingsForExport = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    return settings;
  },
});

import { userSettingsUpdateSchema } from "./lib/schemas";

export const updateUserSettingsForImport = mutation({
  args: {
    settings: userSettingsUpdateSchema,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existingSettings) {
      // Update existing settings
      await ctx.db.patch(existingSettings._id, {
        ...args.settings,
        updatedAt: now,
      });
    } else {
      // Create new settings
      await ctx.db.insert("userSettings", {
        userId,
        ...args.settings,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

export const togglePersonasEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const now = Date.now();

    await (existingSettings
      ? ctx.db.patch(existingSettings._id, {
          personasEnabled: args.enabled,
          updatedAt: now,
        })
      : ctx.db.insert("userSettings", {
          userId,
          personasEnabled: args.enabled,
          createdAt: now,
          updatedAt: now,
        }));

    return { success: true };
  },
});

export const updateArchiveSettings = mutation({
  args: {
    autoArchiveEnabled: v.boolean(),
    autoArchiveDays: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    // Validate autoArchiveDays range (1-365 days)
    if (args.autoArchiveDays < 1 || args.autoArchiveDays > 365) {
      throw new Error("Archive days must be between 1 and 365");
    }

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, {
        autoArchiveEnabled: args.autoArchiveEnabled,
        autoArchiveDays: args.autoArchiveDays,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        autoArchiveEnabled: args.autoArchiveEnabled,
        autoArchiveDays: args.autoArchiveDays,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});
