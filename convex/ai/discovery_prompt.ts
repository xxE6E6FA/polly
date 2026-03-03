/**
 * Prompt evolution for Discovery Mode.
 *
 * Takes liked/disliked context and evolves new image generation prompts,
 * steering toward liked aesthetics and away from disliked ones.
 * Also selects the best model and aspect ratio for each generation.
 */
import { v } from "convex/values";

import { api } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { generateTextWithProvider } from "./text_generation";

const MODEL_SELECTION_INSTRUCTIONS = `You must also choose which image model to use. You have access to a list of available models — pick the one that best matches the style, subject, and mood of your prompt. DON'T just stick with one model. Different models have different strengths:
- Some excel at photorealism, others at illustration, anime, painterly styles, or abstract art
- Newer/experimental models can produce surprising and unique results
- Match the model to the creative intent of each prompt

CRITICAL: If the last 2-3 prompts used the same model, you MUST switch to a different one. Model variety is as important as prompt variety. Repeating the same model 3+ times in a row is a failure mode.

If none of the available models are a great fit for what you want to create, you can suggest a Replicate search query instead. For example, if you want an anime-style model but none are available, set "searchQuery" to "anime illustration" and we'll find one on Replicate. Be specific with search queries — include the style, medium, or technique you're looking for.

IMPORTANT: Vary your model choices! Don't default to the same model every time. Exploration means trying different rendering engines, not just different prompts.`;

const DISCOVERY_SYSTEM_PROMPT = `You are an AI image prompt director exploring creative possibilities. Given a seed concept, liked prompts (steer toward), and disliked prompts (steer away from), write a NEW image generation prompt.

RULES FOR VARIETY — you MUST vary at least 2 of these between every generation:
- Subject matter (person, landscape, object, animal, architecture, abstract)
- Medium (photography, oil painting, watercolor, digital art, pencil sketch, collage, 3D render)
- Composition (close-up, wide angle, bird's eye, dutch angle, symmetrical, rule of thirds)
- Lighting (golden hour, neon, chiaroscuro, flat, backlit, overexposed, candlelit)
- Color palette (monochrome, complementary, analogous, neon, muted earth tones, pastel)
- Mood/era (nostalgic, futuristic, unsettling, serene, chaotic, vintage 1970s, Art Deco)
- Scale (macro, miniature, epic landscape, intimate portrait)

Be cinematically specific — mention camera angles, textures, time of day, weather. NEVER paraphrase or lightly edit a liked prompt. Use liked prompts as directional signals for taste, then make a bold creative leap. 30-80 words, concrete and visual.

You must also choose the best aspect ratio for the image from: 1:1, 16:9, 9:16, 4:3, 3:4. Pick the ratio that best suits the subject matter (e.g. landscapes → 16:9, portraits → 9:16, square for balanced compositions).

${MODEL_SELECTION_INSTRUCTIONS}

Also include an "explanation" field (1-2 sentences) describing your creative reasoning — why you chose this subject, style, model, or direction. This helps the user understand your thinking.

Respond in this exact JSON format (no markdown fences):
{"prompt": "your prompt here", "aspectRatio": "1:1", "modelId": "owner/model-name", "explanation": "your reasoning here"}

If you want to search for a model on Replicate instead:
{"prompt": "your prompt here", "aspectRatio": "1:1", "searchQuery": "search terms for the ideal model", "explanation": "your reasoning here"}`;

const FIRST_GEN_NO_SEED_PROMPT = `Write a vivid, visually striking image generation prompt. Pick an interesting subject, setting, and style. Be concrete and specific — mention camera angle, lighting, textures, time of day. 30-80 words.

Also choose the best aspect ratio from: 1:1, 16:9, 9:16, 4:3, 3:4.

${MODEL_SELECTION_INSTRUCTIONS}

Also include an "explanation" field (1-2 sentences) describing your creative reasoning — why you chose this subject, style, model, or direction.

Respond in this exact JSON format (no markdown fences):
{"prompt": "your prompt here", "aspectRatio": "1:1", "modelId": "owner/model-name", "explanation": "your reasoning here"}

If you want to search for a model on Replicate instead:
{"prompt": "your prompt here", "aspectRatio": "1:1", "searchQuery": "search terms for the ideal model", "explanation": "your reasoning here"}`;

const VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export type DiscoveryPromptResult = {
	prompt: string;
	aspectRatio: string;
	modelId?: string;
	searchQuery?: string;
	explanation?: string;
};

export type AvailableModelInfo = {
	modelId: string;
	name: string;
	description?: string;
	tags?: string[];
};

function formatModelsForPrompt(models: AvailableModelInfo[]): string {
	if (models.length === 0) {
		return "\nNo models currently available. Use searchQuery to find one on Replicate.";
	}

	const modelLines = models.map((m) => {
		const desc = m.description ? ` — ${m.description}` : "";
		const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
		return `- ${m.modelId}: ${m.name}${desc}${tags}`;
	});

	return `\nAvailable models:\n${modelLines.join("\n")}`;
}

function parsePromptResult(
	raw: string,
	availableModelIds: Set<string>,
): DiscoveryPromptResult {
	// Try to parse as JSON first
	try {
		// Strip markdown fences if present
		const cleaned = raw
			.replace(/```json?\s*\n?/g, "")
			.replace(/```\s*$/g, "")
			.trim();
		const parsed = JSON.parse(cleaned);
		if (parsed.prompt && typeof parsed.prompt === "string") {
			const result: DiscoveryPromptResult = {
				prompt: parsed.prompt,
				aspectRatio: VALID_ASPECT_RATIOS.includes(parsed.aspectRatio)
					? parsed.aspectRatio
					: "1:1",
			};

			// Handle model selection
			if (parsed.searchQuery && typeof parsed.searchQuery === "string") {
				result.searchQuery = parsed.searchQuery;
			} else if (parsed.modelId && typeof parsed.modelId === "string") {
				// Only accept if it's actually available
				if (availableModelIds.has(parsed.modelId)) {
					result.modelId = parsed.modelId;
				}
				// If not available, leave modelId undefined — orchestrator will use default
			}

			if (parsed.explanation && typeof parsed.explanation === "string") {
				result.explanation = parsed.explanation;
			}

			return result;
		}
	} catch {
		// Fall through to plain text fallback
	}
	// Fallback: treat the whole response as a prompt
	return { prompt: raw.trim(), aspectRatio: "1:1" };
}

export const evolveDiscoveryPrompt = internalAction({
	args: {
		userId: v.id("users"),
		seedPrompt: v.optional(v.string()),
		seedImageDescription: v.optional(v.string()),
		likedPrompts: v.array(v.string()),
		dislikedPrompts: v.array(v.string()),
		personaId: v.optional(v.id("personas")),
		isFirstGeneration: v.boolean(),
		hint: v.optional(
			v.union(v.literal("remix"), v.literal("wilder"), v.literal("fresh")),
		),
		availableModels: v.array(
			v.object({
				modelId: v.string(),
				name: v.string(),
				description: v.optional(v.string()),
				tags: v.optional(v.array(v.string())),
			}),
		),
	},
	handler: async (ctx, args): Promise<DiscoveryPromptResult> => {
		const availableModelIds = new Set(
			args.availableModels.map((m) => m.modelId),
		);
		const modelsContext = formatModelsForPrompt(args.availableModels);

		// Resolve persona style if provided
		let personaStyle = "";
		if (args.personaId) {
			const persona = await ctx.runQuery(api.personas.get, {
				id: args.personaId,
			});
			if (persona?.prompt) {
				personaStyle = `\n\nAdopt the following style and perspective:\n${persona.prompt}`;
			}
		}

		// First generation paths
		if (args.isFirstGeneration) {
			const seed = args.seedPrompt || args.seedImageDescription || "";

			if (seed) {
				const raw = await generateTextWithProvider({
					prompt: `${DISCOVERY_SYSTEM_PROMPT}${modelsContext}${personaStyle}\n\nSeed concept: ${seed}\n\nWrite a detailed image generation prompt based on this seed. Pick the best model for this concept.`,
					maxOutputTokens: 512,
					temperature: 0.95,
				});
				return parsePromptResult(raw, availableModelIds);
			}

			if (personaStyle) {
				const raw = await generateTextWithProvider({
					prompt: `${DISCOVERY_SYSTEM_PROMPT}${modelsContext}${personaStyle}\n\nNo seed concept provided. Generate a visually striking prompt that embodies the given style. Pick the best model for it.`,
					maxOutputTokens: 512,
					temperature: 1.0,
				});
				return parsePromptResult(raw, availableModelIds);
			}

			// Nothing at all — broad creative prompt
			const raw = await generateTextWithProvider({
				prompt: FIRST_GEN_NO_SEED_PROMPT + modelsContext + personaStyle,
				maxOutputTokens: 512,
				temperature: 1.0,
			});
			return parsePromptResult(raw, availableModelIds);
		}

		// Subsequent generations — evolve from context
		const parts: string[] = [
			DISCOVERY_SYSTEM_PROMPT + modelsContext + personaStyle,
		];

		// Determine temperature based on hint
		let temperature = 0.9;

		if (args.hint === "fresh") {
			temperature = 1.0;
			// Fresh: skip liked context, but include the most recently disliked prompt so AI knows what to avoid
			if (args.seedPrompt || args.seedImageDescription) {
				parts.push(
					`\nOriginal seed (for distant reference only): ${args.seedPrompt || args.seedImageDescription}`,
				);
			}
			if (args.dislikedPrompts.length > 0) {
				const lastDisliked =
					args.dislikedPrompts[args.dislikedPrompts.length - 1];
				parts.push(
					`\nMost recently rejected (AVOID this direction):\n${lastDisliked}`,
				);
			}
			parts.push(
				"\nForget all previous directions. Explore a completely new genre you haven't tried — pick from: street photography, art nouveau, vaporwave, ukiyo-e, brutalist architecture, macro nature, sci-fi concept art, fashion editorial, botanical illustration, glitch art, film noir, or something else entirely unexpected. Try a different model than before!",
			);
		} else {
			if (args.seedPrompt || args.seedImageDescription) {
				parts.push(
					`\nOriginal seed: ${args.seedPrompt || args.seedImageDescription}`,
				);
			}

			if (args.likedPrompts.length > 0) {
				parts.push(
					`\nLiked prompts (steer toward these):\n${args.likedPrompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
				);
			}

			if (args.dislikedPrompts.length > 0) {
				parts.push(
					`\nDisliked prompts (steer away from these):\n${args.dislikedPrompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
				);
			}

			if (args.hint === "remix") {
				parts.push(
					"\nREMIX MODE: Keep the EXACT same subject, but make a radical stylistic leap — change the medium entirely (e.g. photo → oil painting → pixel art), change the era, or switch to a completely different model. The subject stays; everything else transforms.",
				);
			} else if (args.hint === "wilder") {
				parts.push(
					"\nWILDER MODE: Amplify the most striking element to 11 — exaggerate scale, saturation, drama, detail. Push past good taste into the extraordinary. More contrast, more texture, more intensity. If a different model would produce more dramatic results, switch to it.",
				);
			}
		}

		parts.push(
			"\nWrite the next image generation prompt with your chosen aspect ratio and model.",
		);

		const raw = await generateTextWithProvider({
			prompt: parts.join("\n"),
			maxOutputTokens: 512,
			temperature,
		});
		return parsePromptResult(raw, availableModelIds);
	},
});
