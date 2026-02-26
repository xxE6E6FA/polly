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

const DESCRIBE_IMAGE_PROMPT = `You are an expert at writing image generation prompts. Given this image, describe it as a detailed prompt that could be used to recreate it with an AI image generator.

Focus on:
- Subject matter and composition
- Art style, medium, and technique
- Lighting, colors, and mood
- Camera angle and perspective (if photographic)
- Key details and textures

Write ONLY the prompt text, no explanations or preamble. Keep it under 200 words.`;

const ENHANCE_PROMPT_SYSTEM = `You are an expert at writing prompts for AI image generation. Transform the user's simple description into a detailed, vivid image generation prompt.

Add specifics about:
- Art style and medium (e.g., digital painting, photograph, watercolor)
- Lighting and atmosphere
- Composition and perspective
- Colors and mood
- Fine details and textures
- Quality modifiers (e.g., highly detailed, 8k, professional)

Write ONLY the enhanced prompt text, no explanations or preamble. Keep it under 200 words.

If the input is empty or very vague, create an interesting, creative prompt.`;

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
