/**
 * AI-powered prompt generation for canvas image generation.
 *
 * Two modes:
 * 1. "describe_image" — vision model describes an uploaded image as a generation prompt
 * 2. "enhance_prompt" — text model expands a simple prompt into a detailed one
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";

import { api } from "../_generated/api";
import { action } from "../_generated/server";
import { getAuthUserId } from "../lib/auth";
import { arrayBufferToBase64 } from "../lib/encoding";
import { CONFIG } from "./config";
import { createLanguageModel } from "./server_streaming";
import { generateTextWithProvider } from "./text_generation";
import type { ProviderType } from "../types";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";

const DESCRIBE_IMAGE_PROMPT = `Describe this image as a prompt that could recreate it with an AI image generator.

Write direct, descriptive language — as if captioning a photo that already exists. Structure: subject first, then scene/setting, then visual style or medium, then lighting, then 1–2 key details or textures. Be concrete — "a tabby cat curled on a sun-faded velvet armchair" not "a cat on furniture". For photos, mention lens or film characteristics. For illustrations, name the style.

Write ONLY the prompt, no labels or preamble. Keep it 30–80 words.`;

const ENHANCE_PROMPT_SYSTEM = `You enhance simple ideas into effective AI image generation prompts.

Write direct, descriptive language — as if captioning a photo that already exists. Never use conversational phrasing like "Create an image of..." or "The scene shows...".

Structure: subject first (concrete, specific), then setting/scene, then visual style or medium, then lighting, then 1–2 key details or textures.

Be concrete — "a weathered fisherman mending nets on a dock at dawn" not "a person working". Name a specific style: "35mm film photography", "watercolor illustration", "cel-shaded". Describe lighting precisely: "golden hour side-lighting" not "nice lighting". Translate abstract emotions into visual elements: "hunched shoulders, rain-soaked bench, desaturated tones" not "a feeling of sadness".

Only describe what IS in the image — no negative instructions or "without" phrases. Skip generic quality tokens like "8k, masterpiece, best quality, ultra detailed" — use specific visual details instead. Every word should contribute visual direction.

Keep it 30–80 words. Write ONLY the prompt. If the input is empty or vague, invent a vivid scene. Preserve the user's core idea.`;

async function fetchImageData(
	ctx: { storage: { get: (id: string) => Promise<Blob | null> } },
	storageId: string,
): Promise<{ base64: string; mediaType: string }> {
	const blob = await ctx.storage.get(storageId);
	if (!blob) {
		throw new Error("Image not found in storage");
	}
	const arrayBuffer = await blob.arrayBuffer();
	const base64 = arrayBufferToBase64(arrayBuffer);
	const mediaType = blob.type || "image/jpeg";
	return { base64, mediaType };
}

export const generateImagePrompt = action({
	args: {
		mode: v.union(v.literal("describe_image"), v.literal("enhance_prompt")),
		imageStorageId: v.optional(v.id("_storage")),
		simplePrompt: v.optional(v.string()),
		provider: v.optional(v.string()),
		modelId: v.optional(v.string()),
		personaId: v.optional(v.id("personas")),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Resolve persona style instructions if provided
		let personaStyle = "";
		if (args.personaId) {
			const persona = await ctx.runQuery(api.personas.get, { id: args.personaId });
			if (persona?.prompt) {
				personaStyle = `\n\nAdopt the following style and perspective:\n${persona.prompt}`;
			}
		}

		// If user specified a provider + model, resolve their API key and create model
		if (args.provider && args.modelId) {
			// biome-ignore lint/suspicious/noExplicitAny: provider string validated at runtime by Convex
			const apiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
				provider: args.provider as any,
			});

			if (!apiKey) {
				throw new Error(`No API key found for provider: ${args.provider}`);
			}

			const languageModel = await createLanguageModel(
				ctx,
				args.provider as ProviderType,
				args.modelId,
				apiKey as string,
			);

			if (args.mode === "describe_image") {
				if (!args.imageStorageId) {
					throw new Error("imageStorageId is required for describe_image mode");
				}

				const imageData = await fetchImageData(ctx, args.imageStorageId);

				const result = await generateText({
					model: languageModel,
					messages: [
						{
							role: "user",
							content: [
								{ type: "image", image: imageData.base64, mediaType: imageData.mediaType },
								{ type: "text", text: DESCRIBE_IMAGE_PROMPT + personaStyle },
							],
						},
					],
					maxOutputTokens: 500,
					temperature: 0.7,
				});

				return result.text;
			}

			// enhance_prompt mode
			const result = await generateText({
				model: languageModel,
				system: ENHANCE_PROMPT_SYSTEM + personaStyle,
				prompt: args.simplePrompt || "Create a visually striking and creative image",
				maxOutputTokens: 500,
				temperature: 0.8,
			});

			return result.text;
		}

		// Default: use internal model
		if (args.mode === "describe_image") {
			if (!args.imageStorageId) {
				throw new Error("imageStorageId is required for describe_image mode");
			}

			const apiKey = process.env[CONFIG.PROVIDER_ENV_KEYS.google];
			if (!apiKey) {
				throw new Error(
					"No internal API key available. Please select a model with a configured API key.",
				);
			}

			const imageData = await fetchImageData(ctx, args.imageStorageId);

			const google = createGoogleGenerativeAI({ apiKey });
			const model = google.chat(DEFAULT_BUILTIN_MODEL_ID);

			const result = await generateText({
				model,
				messages: [
					{
						role: "user",
						content: [
							{ type: "image", image: imageData.base64, mediaType: imageData.mediaType },
							{ type: "text", text: DESCRIBE_IMAGE_PROMPT + personaStyle },
						],
					},
				],
				maxOutputTokens: 500,
				temperature: 0.7,
			});

			return result.text;
		}

		// enhance_prompt with internal model
		return generateTextWithProvider({
			prompt: `${ENHANCE_PROMPT_SYSTEM}${personaStyle}\n\nUser prompt: ${args.simplePrompt || "Create a visually striking and creative image"}`,
			maxOutputTokens: 500,
			temperature: 0.8,
		});
	},
});
