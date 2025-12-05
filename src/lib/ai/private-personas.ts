/**
 * Persona management for private chat mode
 * Fetches persona prompts from Convex and merges with baseline system prompts
 */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getBaselineInstructions,
  mergeSystemPrompts,
} from "@shared/system-prompts";
import { useQuery } from "convex/react";
import { useMemo } from "react";

export function usePrivatePersona(
  personaId: Id<"personas"> | null | undefined,
  modelName = "AI Model"
) {
  const persona = useQuery(
    api.personas.get,
    personaId ? { id: personaId } : "skip"
  );

  const systemPrompt = useMemo(() => {
    const baselineInstructions = getBaselineInstructions(modelName);
    const personaPrompt = persona?.prompt;

    return mergeSystemPrompts(baselineInstructions, personaPrompt);
  }, [persona, modelName]);

  return {
    persona,
    systemPrompt,
  };
}
