import type { Id } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../_generated/server";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../../shared/constants";
import { getAuthenticatedUser } from "../shared_utils";
import { validatePersonaOwnership } from "./helpers";

// ============================================================================
// Mutation handler implementations
// ============================================================================

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
  await validatePersonaOwnership(ctx, args.id, userId);

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
  await validatePersonaOwnership(ctx, args.id, userId);

  await ctx.db.delete("personas", args.id);
}

export async function togglePersonaHandler(
  ctx: MutationCtx,
  args: { id: Id<"personas">; isActive: boolean }
) {
  const userId = await getAuthenticatedUser(ctx);
  await validatePersonaOwnership(ctx, args.id, userId);

  await ctx.db.patch("personas", args.id, {
    isActive: args.isActive,
    updatedAt: Date.now(),
  });
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

// ============================================================================
// Action handler implementations (external API calls)
// ============================================================================

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
    "- temperature (0.0-2.0)\n" +
    "- topP (0.0-1.0)\n" +
    "- topK (integer >= 0; only when useful)\n" +
    "- frequencyPenalty (e.g., -2.0 to 2.0)\n" +
    "- presencePenalty (e.g., -2.0 to 2.0)\n" +
    "- repetitionPenalty (e.g., 0.8-1.5; >1 penalizes repetition)\n" +
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
  const data = (await res.json()) as GeminiResponse;
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

  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const improvedPrompt =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!improvedPrompt) {
    throw new Error("No improvement generated");
  }

  return { improvedPrompt };
}
