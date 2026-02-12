import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { DEFAULT_BUILTIN_MODEL_ID } from "../shared/constants";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  createEmptyPaginationResult,
  paginationOptsSchema,
  validatePaginationOpts,
} from "./lib/pagination";
import { personaImportSchema } from "./lib/schemas";
import { getAuthenticatedUser } from "./lib/shared_utils";

// Shared handler for persona ownership validation
async function handleValidatePersonaOwnership(
  ctx: MutationCtx | QueryCtx,
  personaId: Id<"personas">,
  userId: Id<"users">
): Promise<Doc<"personas">> {
  const persona = await ctx.db.get("personas", personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }

  // Only allow operations on user's own personas
  if (persona.userId && persona.userId !== userId) {
    throw new Error("Not authorized to modify this persona");
  }

  return persona;
}

// ============================================================================
// EXPORTED HANDLERS FOR TESTING
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

export async function getHandler(ctx: QueryCtx, args: { id: Id<"personas"> }) {
  return await ctx.db.get("personas", args.id);
}

export async function createHandler(
  ctx: MutationCtx,
  args: {
    name: string;
    description: string;
    prompt: string;
    icon?: string;
    ttsVoiceId?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    advancedSamplingEnabled?: boolean;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  const now = Date.now();

  return await ctx.db.insert("personas", {
    userId,
    name: args.name,
    description: args.description,
    prompt: args.prompt,
    icon: args.icon,
    ttsVoiceId: args.ttsVoiceId,
    temperature: args.temperature,
    topP: args.topP,
    topK: args.topK,
    frequencyPenalty: args.frequencyPenalty,
    presencePenalty: args.presencePenalty,
    repetitionPenalty: args.repetitionPenalty,
    advancedSamplingEnabled: args.advancedSamplingEnabled,
    isBuiltIn: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"personas">;
    name?: string;
    description?: string;
    prompt?: string;
    icon?: string;
    ttsVoiceId?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    advancedSamplingEnabled?: boolean;
  }
) {
  const userId = await getAuthenticatedUser(ctx);
  await handleValidatePersonaOwnership(ctx, args.id, userId);

  await ctx.db.patch("personas", args.id, {
    ...(args.name !== undefined && { name: args.name }),
    ...(args.description !== undefined && { description: args.description }),
    ...(args.prompt !== undefined && { prompt: args.prompt }),
    ...(args.icon !== undefined && { icon: args.icon }),
    ...(args.ttsVoiceId !== undefined && { ttsVoiceId: args.ttsVoiceId }),
    ...(args.temperature !== undefined && { temperature: args.temperature }),
    ...(args.topP !== undefined && { topP: args.topP }),
    ...(args.topK !== undefined && { topK: args.topK }),
    ...(args.frequencyPenalty !== undefined && {
      frequencyPenalty: args.frequencyPenalty,
    }),
    ...(args.presencePenalty !== undefined && {
      presencePenalty: args.presencePenalty,
    }),
    ...(args.repetitionPenalty !== undefined && {
      repetitionPenalty: args.repetitionPenalty,
    }),
    ...(args.advancedSamplingEnabled !== undefined && {
      advancedSamplingEnabled: args.advancedSamplingEnabled,
    }),
    updatedAt: Date.now(),
  });
}

export async function removeHandler(
  ctx: MutationCtx,
  args: { id: Id<"personas"> }
) {
  const userId = await getAuthenticatedUser(ctx);
  await handleValidatePersonaOwnership(ctx, args.id, userId);

  await ctx.db.delete("personas", args.id);
}

export async function togglePersonaHandler(
  ctx: MutationCtx,
  args: { id: Id<"personas">; isActive: boolean }
) {
  const userId = await getAuthenticatedUser(ctx);
  await handleValidatePersonaOwnership(ctx, args.id, userId);

  await ctx.db.patch("personas", args.id, {
    isActive: args.isActive,
    updatedAt: Date.now(),
  });
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

export async function importPersonasHandler(
  ctx: MutationCtx,
  args: {
    personas: Array<{
      name: string;
      description: string;
      prompt: string;
      icon?: string;
    }>;
  }
) {
  const userId = await getAuthenticatedUser(ctx);

  const now = Date.now();
  const createdPersonas = [];

  for (const persona of args.personas) {
    const personaId = await ctx.db.insert("personas", {
      userId,
      name: persona.name,
      description: persona.description,
      prompt: persona.prompt,
      icon: persona.icon,
      // Imported personas don't include advanced params by default
      isBuiltIn: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    createdPersonas.push(personaId);
  }

  return createdPersonas;
}

export async function suggestSamplingHandler(
  _ctx: ActionCtx,
  args: { systemPrompt: string }
): Promise<{
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }

  const systemPrompt =
    "ROLE: You are an Intuitive Sampling Tuner for LLM decoding.\n" +
    "GOAL: Read the system prompt, feel its vibe, and choose decoding parameters that best fit the intent and tone. Favor your gut over rigid rules.\n\n" +
    "OUTPUT: Return ONLY a compact JSON object with any of these numeric keys (omit those that don't feel necessary):\n" +
    "- temperature (0.0–2.0)\n" +
    "- topP (0.0–1.0)\n" +
    "- topK (integer ≥ 0; only when useful)\n" +
    "- frequencyPenalty (e.g., -2.0 to 2.0)\n" +
    "- presencePenalty (e.g., -2.0 to 2.0)\n" +
    "- repetitionPenalty (e.g., 0.8–1.5; >1 penalizes repetition)\n" +
    "Use numbers only. No code fences or commentary.\n\n" +
    "GUIDANCE:\n" +
    "- Let the prompt's style lead you. If it wants creativity or exploration, be bolder; if it wants precision or compliance, be steadier.\n" +
    "- Choose a coherent set of values that you would personally prefer for this prompt.\n" +
    "- Only include parameters that add value for this prompt. If unsure, leave it out.";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_BUILTIN_MODEL_ID}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            parts: [
              {
                text: `Read this system prompt and intuitively choose decoding parameters that best fit it. Return only JSON.\n\n${args.systemPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: 200,
          // Request JSON-like output if supported by provider
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status}`);
  }
  type GeminiResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const data: GeminiResponse = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  let jsonText: string;
  try {
    JSON.parse(cleaned);
    jsonText = cleaned;
  } catch (_parseError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      jsonText = cleaned.slice(start, end + 1);
    } else {
      jsonText = "{}";
    }
  }
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const asNumber = (v: unknown): number | undefined => {
      if (typeof v === "number") {
        return v;
      }
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    };
    return {
      temperature: asNumber(parsed.temperature),
      topP: asNumber(parsed.topP),
      topK: asNumber(parsed.topK),
      frequencyPenalty: asNumber(parsed.frequencyPenalty),
      presencePenalty: asNumber(parsed.presencePenalty),
      repetitionPenalty: asNumber(parsed.repetitionPenalty),
    };
  } catch (_e) {
    return {};
  }
}

export async function listAllBuiltInHandler(ctx: QueryCtx, _args: {}) {
  return await ctx.db
    .query("personas")
    .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
    .filter(q => q.eq(q.field("isActive"), true))
    .collect();
}

export async function getUserPersonaSettingsHandler(ctx: QueryCtx, _args: {}) {
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

type PersonaType = "built-in" | "custom";
type PersonaSortField = "name" | "type";

export interface EnrichedPersona {
  _id: Id<"personas">;
  _creationTime: number;
  name: string;
  description: string;
  prompt: string;
  icon?: string;
  ttsVoiceId?: string;
  isBuiltIn: boolean;
  isActive: boolean;
  type: PersonaType;
  isDisabled: boolean;
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
    type: "built-in" as PersonaType,
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
    type: "custom" as PersonaType,
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

export async function toggleBuiltInPersonaHandler(
  ctx: MutationCtx,
  args: { personaId: Id<"personas">; isDisabled: boolean }
) {
  const userId = await getAuthenticatedUser(ctx);

  // Verify this is a built-in persona
  const persona = await ctx.db.get("personas", args.personaId);
  if (!persona?.isBuiltIn) {
    throw new Error("Can only toggle built-in personas");
  }

  // Check if setting already exists
  const existingSetting = await ctx.db
    .query("userPersonaSettings")
    .withIndex("by_user_persona", q =>
      q.eq("userId", userId).eq("personaId", args.personaId)
    )
    .first();

  const now = Date.now();

  if (existingSetting) {
    // Update existing setting
    await ctx.db.patch("userPersonaSettings", existingSetting._id, {
      isDisabled: args.isDisabled,
      updatedAt: now,
    });
  } else {
    // Create new setting
    await ctx.db.insert("userPersonaSettings", {
      userId,
      personaId: args.personaId,
      isDisabled: args.isDisabled,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { success: true };
}

export async function improvePromptHandler(
  _ctx: ActionCtx,
  args: { prompt: string }
): Promise<{ improvedPrompt: string }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }

  const promptText = `You are a system prompt improvement assistant. Take the user's initial prompt and transform it into a more detailed, structured system prompt for an AI assistant.

Follow these guidelines:
1. Maintain the core intent and personality of the original prompt
2. Structure the improved prompt with clear sections using markdown headers
3. Include specific behavioral guidelines:
   - Communication style and tone instructions
   - Response formatting preferences
   - How to handle limitations or things you can't do
   - Safety and ethics considerations if relevant
4. Avoid unnecessary affirmations like "Certainly!", "Of course!", etc.
5. Emphasize being direct and genuinely helpful
6. Add instructions for:
   - When to be concise vs. thorough
   - How to match the user's tone
   - How to handle uncertainty
7. Keep it focused and practical (aim for 300-500 words)
8. Use second person ("You are...", "You should...")
9. End with a brief reminder of the assistant's core purpose

Return ONLY the improved prompt text, no explanations or metadata.

User's initial prompt:
${args.prompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_BUILTIN_MODEL_ID}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    await response.json(); // Consume the error response
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const improvedPrompt =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!improvedPrompt) {
    throw new Error("No improvement generated");
  }

  return { improvedPrompt };
}

// ============================================================================
// CONVEX QUERY/MUTATION/ACTION EXPORTS
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
    // TTS override
    ttsVoiceId: v.optional(v.string()),
    // Advanced sampling params (all optional)
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
    // Whether advanced sampling is enabled
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
    // TTS override
    ttsVoiceId: v.optional(v.string()),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    topK: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    repetitionPenalty: v.optional(v.number()),
    // Whether advanced sampling is enabled
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

// Auto-tune sampling parameters from a system prompt using a built-in model
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

// List all user personas for settings page (including inactive ones)
export const listAllForSettings = query({
  args: {},
  handler: listAllForSettingsHandler,
});

// List all built-in personas for settings page (including inactive)
export const listAllBuiltInForSettings = query({
  handler: listAllBuiltInForSettingsHandler,
});

// Paginated list of all personas (built-in + custom) for settings page
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
