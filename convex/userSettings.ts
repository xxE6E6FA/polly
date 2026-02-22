import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { getAuthUserId } from "./lib/auth";
import { userSettingsUpdateSchema } from "./lib/schemas";
import { getAuthenticatedUser } from "./lib/shared_utils";

// Shared handler for getting user settings
async function handleGetUserSettings(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">
): Promise<Doc<"userSettings"> | null> {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_user", q => q.eq("userId", userId))
    .first();
}

// Shared handler for upserting user settings
async function handleUpsertUserSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  updates: Partial<Doc<"userSettings">>
): Promise<void> {
  const existingSettings = await handleGetUserSettings(ctx, userId);
  const now = Date.now();

  if (existingSettings) {
    await ctx.db.patch("userSettings", existingSettings._id, {
      ...updates,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userSettings", {
      userId,
      ...updates,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getUserSettingsHandler(ctx: QueryCtx) {
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
      showMessageMetadata: false,
      showTemperaturePicker: true, // Default to enabled
      memoryEnabled: false, // Default to disabled (opt-in)
      activeProfileId: undefined,
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
    showMessageMetadata: settings.showMessageMetadata ?? false,
    showTemperaturePicker: settings.showTemperaturePicker ?? true, // Default to enabled
    memoryEnabled: settings.memoryEnabled ?? false, // Default to disabled (opt-in)
    activeProfileId: settings.activeProfileId,
  };
}

export const getUserSettings = query({
  args: {},
  handler: getUserSettingsHandler,
});

type UpdateUserSettingsArgs = {
  personasEnabled?: boolean;
  openRouterSorting?: "default" | "price" | "throughput" | "latency";
  anonymizeForDemo?: boolean;
  autoArchiveEnabled?: boolean;
  autoArchiveDays?: number;
  ttsVoiceId?: string;
  ttsModelId?: string;
  ttsUseAudioTags?: boolean;
  ttsStabilityMode?: "creative" | "natural" | "robust";
  showMessageMetadata?: boolean;
  showTemperaturePicker?: boolean;
  memoryEnabled?: boolean;
};

export async function updateUserSettingsHandler(
  ctx: MutationCtx,
  args: UpdateUserSettingsArgs
) {
  const userId = await getAuthenticatedUser(ctx);

  const existingSettings = await handleGetUserSettings(ctx, userId);

  // Build updates object with conditional properties
  const updates: Partial<Doc<"userSettings">> = {
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
    ...(args.showMessageMetadata !== undefined && {
      showMessageMetadata: args.showMessageMetadata,
    }),
    ...(args.showTemperaturePicker !== undefined && {
      showTemperaturePicker: args.showTemperaturePicker,
    }),
    ...(args.memoryEnabled !== undefined && {
      memoryEnabled: args.memoryEnabled,
    }),
  };

  // Add defaults for new settings creation if no settings exist
  if (!existingSettings) {
    Object.assign(updates, {
      personasEnabled: args.personasEnabled ?? true,
      openRouterSorting: args.openRouterSorting ?? "default",
      anonymizeForDemo: args.anonymizeForDemo ?? false,
      autoArchiveEnabled: args.autoArchiveEnabled ?? false,
      autoArchiveDays: args.autoArchiveDays ?? 30,
      ttsUseAudioTags: args.ttsUseAudioTags ?? true,
      ttsStabilityMode: args.ttsStabilityMode ?? "creative",
      showMessageMetadata: args.showMessageMetadata ?? false,
    });
  }

  await handleUpsertUserSettings(ctx, userId, updates);
  return { success: true };
}

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
    showMessageMetadata: v.optional(v.boolean()),
    showTemperaturePicker: v.optional(v.boolean()),
    ttsVoiceId: v.optional(v.string()),
    ttsModelId: v.optional(v.string()),
    ttsUseAudioTags: v.optional(v.boolean()),
    ttsStabilityMode: v.optional(
      v.union(v.literal("creative"), v.literal("natural"), v.literal("robust"))
    ),
    memoryEnabled: v.optional(v.boolean()),
  },
  handler: updateUserSettingsHandler,
});

export async function getUserSettingsForExportHandler(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", q => q.eq("userId", userId))
    .first();

  return settings;
}

export const getUserSettingsForExport = query({
  args: {},
  handler: getUserSettingsForExportHandler,
});

export async function updateUserSettingsForImportHandler(
  ctx: MutationCtx,
  args: { settings: Partial<Doc<"userSettings">> }
) {
  const userId = await getAuthenticatedUser(ctx);
  await handleUpsertUserSettings(ctx, userId, args.settings);
  return { success: true };
}

export const updateUserSettingsForImport = mutation({
  args: {
    settings: userSettingsUpdateSchema,
  },
  handler: updateUserSettingsForImportHandler,
});

export async function togglePersonasEnabledHandler(
  ctx: MutationCtx,
  args: { enabled: boolean }
) {
  const userId = await getAuthenticatedUser(ctx);
  await handleUpsertUserSettings(ctx, userId, {
    personasEnabled: args.enabled,
  });
  return { success: true };
}

export const togglePersonasEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: togglePersonasEnabledHandler,
});

export async function updateArchiveSettingsHandler(
  ctx: MutationCtx,
  args: { autoArchiveEnabled: boolean; autoArchiveDays: number }
) {
  const userId = await getAuthenticatedUser(ctx);

  // Validate autoArchiveDays range (1-365 days)
  if (args.autoArchiveDays < 1 || args.autoArchiveDays > 365) {
    throw new Error("Archive days must be between 1 and 365");
  }

  await handleUpsertUserSettings(ctx, userId, {
    autoArchiveEnabled: args.autoArchiveEnabled,
    autoArchiveDays: args.autoArchiveDays,
  });
  return { success: true };
}

export const updateArchiveSettings = mutation({
  args: {
    autoArchiveEnabled: v.boolean(),
    autoArchiveDays: v.number(),
  },
  handler: updateArchiveSettingsHandler,
});
