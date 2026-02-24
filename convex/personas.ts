import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { paginationOptsSchema } from "./lib/pagination";
import { personaImportSchema } from "./lib/schemas";

// Re-export types used by frontend
export type { EnrichedPersona } from "./lib/persona/helpers";
export {
  clearAllHandler,
  createHandler,
  importPersonasHandler,
  improvePromptHandler,
  removeHandler,
  suggestSamplingHandler,
  toggleBuiltInPersonaHandler,
  togglePersonaHandler,
  updateHandler,
} from "./lib/persona/mutation_handlers";
// Re-export handler functions for tests
export {
  getHandler,
  getUserPersonaSettingsHandler,
  listAllBuiltInForSettingsHandler,
  listAllBuiltInHandler,
  listAllForSettingsHandler,
  listForExportHandler,
  listForSettingsPaginatedHandler,
  listHandler,
} from "./lib/persona/query_handlers";

import {
  clearAllHandler,
  createHandler,
  importPersonasHandler,
  improvePromptHandler,
  removeHandler,
  suggestSamplingHandler,
  toggleBuiltInPersonaHandler,
  togglePersonaHandler,
  updateHandler,
} from "./lib/persona/mutation_handlers";
import {
  getHandler,
  getUserPersonaSettingsHandler,
  listAllBuiltInForSettingsHandler,
  listAllBuiltInHandler,
  listAllForSettingsHandler,
  listForExportHandler,
  listForSettingsPaginatedHandler,
  listHandler,
} from "./lib/persona/query_handlers";

// ============================================================================
// Convex function registrations
// ============================================================================

export const list = query({
  args: {},
  handler: listHandler,
});

export const get = query({
  args: { id: v.id("personas") },
  handler: getHandler,
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    icon: v.optional(v.string()),
    ttsVoiceId: v.optional(v.string()),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
    advancedSamplingEnabled: v.optional(v.boolean()),
  },
  handler: createHandler,
});

export const update = mutation({
  args: {
    id: v.id("personas"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    prompt: v.optional(v.string()),
    icon: v.optional(v.string()),
    ttsVoiceId: v.optional(v.string()),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
    advancedSamplingEnabled: v.optional(v.boolean()),
  },
  handler: updateHandler,
});

export const remove = mutation({
  args: { id: v.id("personas") },
  handler: removeHandler,
});

export const togglePersona = mutation({
  args: {
    id: v.id("personas"),
    isActive: v.boolean(),
  },
  handler: togglePersonaHandler,
});

export const listForExport = query({
  args: {},
  handler: listForExportHandler,
});

export const importPersonas = mutation({
  args: {
    personas: v.array(personaImportSchema),
  },
  handler: importPersonasHandler,
});

export const suggestSampling = action({
  args: {
    systemPrompt: v.string(),
  },
  handler: suggestSamplingHandler,
});

export const listAllBuiltIn = query({
  handler: listAllBuiltInHandler,
});

export const getUserPersonaSettings = query({
  args: {},
  handler: getUserPersonaSettingsHandler,
});

export const listAllForSettings = query({
  args: {},
  handler: listAllForSettingsHandler,
});

export const listAllBuiltInForSettings = query({
  handler: listAllBuiltInForSettingsHandler,
});

export const listForSettingsPaginated = query({
  args: {
    paginationOpts: paginationOptsSchema,
    sortField: v.optional(v.union(v.literal("name"), v.literal("type"))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: listForSettingsPaginatedHandler,
});

export const toggleBuiltInPersona = mutation({
  args: {
    personaId: v.id("personas"),
    isDisabled: v.boolean(),
  },
  handler: toggleBuiltInPersonaHandler,
});

export const improvePrompt = action({
  args: {
    prompt: v.string(),
  },
  handler: improvePromptHandler,
});

export const clearAll = mutation({
  args: {},
  handler: clearAllHandler,
});

export const internalListForExport = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("personas")
      .withIndex("by_user_active", q => q.eq("userId", args.userId))
      .collect();
  },
});
