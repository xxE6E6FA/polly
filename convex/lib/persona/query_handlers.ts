import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  createEmptyPaginationResult,
  validatePaginationOpts,
} from "../pagination";
import type { EnrichedPersona, PersonaSortField } from "./helpers";

// ============================================================================
// Query handler implementations
// ============================================================================

export async function listHandler(ctx: QueryCtx, _args: {}) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    // Return only built-in personas for anonymous users
    return await ctx.db
      .query("personas")
      .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
      .filter(q => q.eq(q.field("isActive"), true))
      .order("asc")
      .take(50); // Reasonable limit for personas
  }

  // Run all queries in parallel for better performance
  const [builtInPersonas, userPersonas, userPersonaSettings] =
    await Promise.all([
      // Get built-in personas
      ctx.db
        .query("personas")
        .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
        .filter(q => q.eq(q.field("isActive"), true))
        .take(50), // Reasonable limit for built-in personas
      // Get user personas
      ctx.db
        .query("personas")
        .withIndex("by_user_active", q =>
          q.eq("userId", userId).eq("isActive", true)
        )
        .take(100), // Reasonable limit for user personas
      // Get user's persona settings to filter out disabled built-in personas
      ctx.db
        .query("userPersonaSettings")
        .withIndex("by_user_persona", q => q.eq("userId", userId))
        .take(100), // Reasonable limit for user persona settings
    ]);

  const disabledPersonaIds = new Set(
    userPersonaSettings
      .filter(setting => setting.isDisabled)
      .map(setting => setting.personaId)
  );

  // Filter out disabled built-in personas
  const enabledBuiltInPersonas = builtInPersonas.filter(
    persona => !disabledPersonaIds.has(persona._id)
  );

  return [...enabledBuiltInPersonas, ...userPersonas].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );
}

export async function getHandler(
  ctx: QueryCtx,
  args: { id: Id<"personas"> }
) {
  return await ctx.db.get("personas", args.id);
}

export async function listForExportHandler(ctx: QueryCtx, _args: {}) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  return await ctx.db
    .query("personas")
    .withIndex("by_user_active", q =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .take(100); // Reasonable limit for export
}

export async function listAllBuiltInHandler(ctx: QueryCtx, _args: {}) {
  return await ctx.db
    .query("personas")
    .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();
}

export async function getUserPersonaSettingsHandler(
  ctx: QueryCtx,
  _args: {}
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  return await ctx.db
    .query("userPersonaSettings")
    .withIndex("by_user_persona", q => q.eq("userId", userId))
    .collect();
}

export async function listAllForSettingsHandler(ctx: QueryCtx, _args: {}) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  // Get ALL user personas (both active and inactive) and sort by creation time to maintain stable order
  const activePersonas = await ctx.db
    .query("personas")
    .withIndex("by_user_active", q =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .collect();

  const inactivePersonas = await ctx.db
    .query("personas")
    .withIndex("by_user_active", q =>
      q.eq("userId", userId).eq("isActive", false)
    )
    .collect();

  // Combine and sort by creation time to maintain stable ordering regardless of active status
  return [...activePersonas, ...inactivePersonas].sort(
    (a, b) => a._creationTime - b._creationTime
  );
}

export async function listAllBuiltInForSettingsHandler(
  ctx: QueryCtx,
  _args: {}
) {
  // Return all built-in personas regardless of isActive status
  return await ctx.db
    .query("personas")
    .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
    .collect();
}

export async function listForSettingsPaginatedHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts?: { numItems: number; cursor?: string | null } | null;
    sortField?: "name" | "type";
    sortDirection?: "asc" | "desc";
  }
) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return createEmptyPaginationResult<EnrichedPersona>();
  }

  const sortField: PersonaSortField = args.sortField ?? "type";
  const sortDirection = args.sortDirection ?? "asc";

  // Fetch all built-in personas
  const builtInPersonas = await ctx.db
    .query("personas")
    .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
    .collect();

  // Fetch all user personas (both active and inactive)
  const activeUserPersonas = await ctx.db
    .query("personas")
    .withIndex("by_user_active", q =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .collect();

  const inactiveUserPersonas = await ctx.db
    .query("personas")
    .withIndex("by_user_active", q =>
      q.eq("userId", userId).eq("isActive", false)
    )
    .collect();

  const userPersonas = [...activeUserPersonas, ...inactiveUserPersonas];

  // Fetch user persona settings to determine disabled state for built-in personas
  const userPersonaSettings = await ctx.db
    .query("userPersonaSettings")
    .withIndex("by_user_persona", q => q.eq("userId", userId))
    .collect();

  const disabledPersonaIds = new Set(
    userPersonaSettings
      .filter(setting => setting.isDisabled)
      .map(setting => setting.personaId)
  );

  // Enrich built-in personas
  const enrichedBuiltIn: EnrichedPersona[] = builtInPersonas.map(p => ({
    _id: p._id,
    _creationTime: p._creationTime,
    name: p.name,
    description: p.description,
    prompt: p.prompt,
    icon: p.icon,
    ttsVoiceId: p.ttsVoiceId,
    isBuiltIn: true,
    isActive: p.isActive,
    type: "built-in" as const,
    isDisabled: disabledPersonaIds.has(p._id),
  }));

  // Enrich custom personas
  const enrichedCustom: EnrichedPersona[] = userPersonas.map(p => ({
    _id: p._id,
    _creationTime: p._creationTime,
    name: p.name,
    description: p.description,
    prompt: p.prompt,
    icon: p.icon,
    ttsVoiceId: p.ttsVoiceId,
    isBuiltIn: false,
    isActive: p.isActive,
    type: "custom" as const,
    isDisabled: false,
  }));

  // Combine all personas
  const allPersonas = [...enrichedBuiltIn, ...enrichedCustom];

  // Sort personas
  allPersonas.sort((a, b) => {
    let comparison = 0;

    if (sortField === "name") {
      comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    } else if (sortField === "type") {
      // Built-in first (0), then custom (1)
      const typeA = a.type === "built-in" ? 0 : 1;
      const typeB = b.type === "built-in" ? 0 : 1;
      comparison = typeA - typeB;
    }

    // Secondary sort by creation time for stable ordering
    if (comparison === 0) {
      comparison = a._creationTime - b._creationTime;
    }

    return sortDirection === "desc" ? -comparison : comparison;
  });

  // Handle pagination manually since we're combining multiple sources
  const validatedOpts = validatePaginationOpts(
    args.paginationOpts ?? undefined
  );

  if (!validatedOpts) {
    // No pagination requested, return all items
    return {
      page: allPersonas,
      isDone: true,
      continueCursor: null as string | null,
    };
  }

  const { numItems, cursor } = validatedOpts;

  // Parse cursor to get starting index
  const startIndex = cursor ? Number.parseInt(cursor, 10) : 0;
  const endIndex = startIndex + numItems;

  const page = allPersonas.slice(startIndex, endIndex);
  const isDone = endIndex >= allPersonas.length;
  const continueCursor = isDone ? null : String(endIndex);

  return {
    page,
    isDone,
    continueCursor,
  };
}
