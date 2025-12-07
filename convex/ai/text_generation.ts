/**
 * Text generation utility for internal operations
 * Uses AI SDK for non-streaming text generation (titles, summaries, starters)
 */
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { CONFIG } from "./config";

/** Providers supported for internal text generation */
type TextProviderType = "openai" | "anthropic" | "google" | "groq" | "openrouter" | "moonshot";

export type TextGenerationOptions = {
	prompt: string;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
};

export type TextGenerationConfig = {
	provider?: TextProviderType;
	model?: string;
};

/**
 * Create a language model for internal operations (no ActionCtx needed)
 * Uses environment variables for API keys
 */
function createInternalLanguageModel(
	provider: TextProviderType,
	model: string
): LanguageModel | null {
	const envKeyName = CONFIG.PROVIDER_ENV_KEYS[provider];
	const apiKey = envKeyName ? process.env[envKeyName] : undefined;

	if (!apiKey) {
		return null;
	}

	switch (provider) {
		case "google": {
			const google = createGoogleGenerativeAI({ apiKey });
			return google.chat(model);
		}
		case "anthropic": {
			const anthropic = createAnthropic({ apiKey });
			return anthropic.languageModel(model);
		}
		case "openai": {
			const openai = createOpenAI({ apiKey });
			return openai.chat(model);
		}
		case "groq": {
			const groq = createGroq({ apiKey });
			return groq(model);
		}
		case "moonshot": {
			const moonshot = createOpenAI({
				apiKey,
				baseURL: "https://api.moonshot.ai/v1",
			});
			return moonshot.chat(model);
		}
		case "openrouter":
			// OpenRouter requires async setup, not suitable for simple internal ops
			return null;
		default:
			return null;
	}
}

/**
 * Generate text using AI SDK for internal operations
 * Defaults to Google/Gemini, falls back gracefully
 *
 * @param options - The prompt and generation parameters
 * @param config - Optional provider/model override
 * @returns Generated text, or throws if no API key available
 */
export async function generateTextWithProvider(
	options: TextGenerationOptions,
	config?: TextGenerationConfig
): Promise<string> {
	const provider = config?.provider ?? "google";
	const model = config?.model ?? DEFAULT_BUILTIN_MODEL_ID;

	const languageModel = createInternalLanguageModel(provider, model);

	if (!languageModel) {
		throw new Error(
			`No API key available for provider: ${provider}. ` +
				`Set ${CONFIG.PROVIDER_ENV_KEYS[provider]} environment variable.`
		);
	}

	const result = await generateText({
		model: languageModel,
		prompt: options.prompt,
		maxOutputTokens: options.maxTokens,
		temperature: options.temperature,
		topP: options.topP,
	});

	return result.text;
}

/**
 * Check if text generation is available (API key is set)
 */
export function isTextGenerationAvailable(
	provider: TextProviderType = "google"
): boolean {
	const envKeyName = CONFIG.PROVIDER_ENV_KEYS[provider];
	return Boolean(envKeyName && process.env[envKeyName]);
}
