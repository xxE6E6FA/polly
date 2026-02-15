import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/**
 * Validates that the given user owns the specified persona.
 * Throws if the persona is not found or belongs to another user.
 */
export async function validatePersonaOwnership(
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

// Persona type discriminator
export type PersonaType = "built-in" | "custom";

// Sort fields allowed for paginated listing
export type PersonaSortField = "name" | "type";

/**
 * Enriched persona representation used by the settings UI.
 * Combines persona data with computed `type` and `isDisabled` fields.
 */
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
