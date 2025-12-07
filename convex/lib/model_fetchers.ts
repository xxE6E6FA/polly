/**
 * Model fetcher utilities for auto-discovering model capabilities.
 *
 * For Google and Replicate: Fetches individual models (efficient)
 * For OpenAI, Anthropic, Groq, OpenRouter: Fetches all models and filters (API limitation)
 */

import Replicate from "replicate";
import { supportsReasoning } from "../../shared/reasoning-model-detection";

// ============================================================================
// TYPES
// ============================================================================

export type TextModelCapabilities = {
	modelId: string;
	name: string;
	provider: string;
	contextLength: number;
	maxOutputTokens?: number;
	supportsImages: boolean;
	supportsTools: boolean;
	supportsReasoning: boolean;
	supportsFiles: boolean;
};

export type ImageModelCapabilities = {
	modelId: string;
	name: string;
	provider: string;
	description: string;
	supportedAspectRatios: string[];
	supportsUpscaling: boolean;
	supportsInpainting: boolean;
	supportsOutpainting: boolean;
	supportsImageToImage: boolean;
	supportsMultipleImages: boolean;
	supportsNegativePrompt: boolean;
	modelVersion: string;
	owner: string;
	tags: string[];
};

// ============================================================================
// GOOGLE - INDIVIDUAL MODEL FETCH
// ============================================================================

type GoogleApiModel = {
	name: string;
	displayName?: string;
	description?: string;
	inputTokenLimit?: number;
	outputTokenLimit?: number;
	supportedGenerationMethods?: string[];
};

/**
 * Fetch a single Google model by ID.
 * More efficient than fetching all models when you only need one.
 */
export async function fetchGoogleModel(
	modelId: string,
	apiKey: string,
): Promise<TextModelCapabilities | null> {
	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${modelId}?key=${apiKey}`,
		);

		if (!response.ok) {
			console.error(`Google API error: ${response.status}`);
			return null;
		}

		const model: GoogleApiModel = await response.json();
		const displayName = model.displayName || modelId;

		// Check if it supports content generation
		if (!model.supportedGenerationMethods?.includes("generateContent")) {
			console.warn(`Model ${modelId} does not support generateContent`);
			return null;
		}

		// Capability detection based on model ID patterns
		const modelSupportsReasoning = supportsReasoning("google", modelId);

		const supportsTools =
			modelId.includes("2.5-pro") ||
			modelId.includes("2.5-flash") ||
			modelId.includes("2.0-flash") ||
			modelId.includes("1.5-pro") ||
			modelId.includes("pro");

		const supportsImages =
			modelId.includes("2.5-pro") ||
			modelId.includes("2.5-flash") ||
			modelId.includes("2.5-flash-lite") ||
			modelId.includes("2.0-flash") ||
			modelId.includes("2.0-flash-lite") ||
			modelId.includes("1.5-pro") ||
			modelId.includes("1.5-flash") ||
			modelId.includes("pro") ||
			modelId.includes("vision");

		const supportsFiles =
			modelId.includes("2.5-pro") ||
			modelId.includes("2.5-flash") ||
			modelId.includes("2.0-flash") ||
			modelId.includes("1.5-pro") ||
			modelId.includes("1.5-flash") ||
			(model.inputTokenLimit && model.inputTokenLimit >= 32000) ||
			modelId.includes("pro");

		const contextLength = model.inputTokenLimit || getGoogleContextWindow(modelId);

		return {
			modelId,
			name: displayName,
			provider: "google",
			contextLength,
			maxOutputTokens: model.outputTokenLimit,
			supportsReasoning: modelSupportsReasoning,
			supportsTools,
			supportsImages,
			supportsFiles,
		};
	} catch (error) {
		console.error(`Failed to fetch Google model ${modelId}:`, error);
		return null;
	}
}

function getGoogleContextWindow(modelId: string): number {
	if (modelId.includes("gemini-2.5-pro")) {
		return 2097152;
	}
	if (modelId.includes("gemini-2.5-flash")) {
		return 1048576;
	}
	if (modelId.includes("gemini-2.5-flash-lite")) {
		return 1048576;
	}
	if (modelId.includes("gemini-2.0-flash")) {
		return 1048576;
	}
	if (modelId.includes("gemini-2.0-flash-lite")) {
		return 1048576;
	}
	if (modelId.includes("gemini-1.5-pro")) {
		return 2097152;
	}
	if (modelId.includes("gemini-1.5-flash")) {
		return 1048576;
	}
	if (modelId.includes("gemini-pro")) {
		return 32768;
	}
	return 32768;
}

// ============================================================================
// REPLICATE - INDIVIDUAL IMAGE MODEL FETCH
// ============================================================================

type ReplicateModel = {
	owner: string;
	name: string;
	description: string | null;
	latest_version?: {
		id: string;
		openapi_schema?: Record<string, unknown>;
	};
	tags?: string[];
	cover_image_url?: string | null;
};

/**
 * Fetch a single Replicate image model by ID.
 * Returns full capability data from OpenAPI schema.
 */
export async function fetchReplicateImageModel(
	modelId: string,
	apiKey: string,
): Promise<ImageModelCapabilities | null> {
	try {
		const replicate = new Replicate({ auth: apiKey });

		const [owner, name] = modelId.split("/");
		if (!(owner && name)) {
			console.error(`Invalid Replicate model ID format: ${modelId}`);
			return null;
		}

		const model = await replicate.models.get(owner, name);

		if (!model) {
			console.error(`Replicate model not found: ${modelId}`);
			return null;
		}

		const rawModel = model as unknown as ReplicateModel;
		const latestVersion = rawModel.latest_version;

		// Determine capabilities from OpenAPI schema
		const supportedAspectRatios = determineAspectRatioSupport(latestVersion);
		const supportsMultipleImages = determineMultipleImageSupport(latestVersion);
		const supportsNegativePrompt = determineNegativePromptSupport(latestVersion);
		const supportsImageToImage = determineImageInputSupport(latestVersion);

		return {
			modelId,
			name: rawModel.name,
			provider: "replicate",
			description: rawModel.description || "",
			supportedAspectRatios,
			supportsUpscaling: false,
			supportsInpainting: false,
			supportsOutpainting: false,
			supportsImageToImage,
			supportsMultipleImages,
			supportsNegativePrompt,
			modelVersion: String(latestVersion?.id || ""),
			owner: rawModel.owner,
			tags: rawModel.tags || [],
		};
	} catch (error) {
		console.error(`Failed to fetch Replicate model ${modelId}:`, error);
		return null;
	}
}

// Helper functions for Replicate capability detection

function determineAspectRatioSupport(
	latestVersion?: ReplicateModel["latest_version"],
): string[] {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return ["use_dimensions"];
	}

	const aspectRatioProperty = inputProperties.aspect_ratio as
		| Record<string, unknown>
		| undefined;
	if (aspectRatioProperty) {
		const aspectRatioEnum = aspectRatioProperty.enum as unknown;
		if (Array.isArray(aspectRatioEnum)) {
			return aspectRatioEnum.filter((item): item is string => typeof item === "string");
		}
		return ["1:1", "16:9", "9:16", "4:3", "3:4"];
	}

	if (inputProperties.width || inputProperties.height) {
		return ["use_dimensions"];
	}

	return ["use_dimensions"];
}

function determineMultipleImageSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const numOutputsProperty = inputProperties.num_outputs as
		| Record<string, unknown>
		| undefined;
	if (numOutputsProperty) {
		const paramType = numOutputsProperty.type;
		const maximum = numOutputsProperty.maximum as number | undefined;
		if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
			return true;
		}
	}

	const batchSizeProperty = inputProperties.batch_size as
		| Record<string, unknown>
		| undefined;
	if (batchSizeProperty) {
		const paramType = batchSizeProperty.type;
		const maximum = batchSizeProperty.maximum as number | undefined;
		if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
			return true;
		}
	}

	return false;
}

function determineNegativePromptSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const negativePromptProperty = inputProperties.negative_prompt as
		| Record<string, unknown>
		| undefined;

	if (negativePromptProperty) {
		return negativePromptProperty.type === "string";
	}

	return false;
}

function determineImageInputSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const imageParamNames = [
		"image_input",
		"image_inputs",
		"image",
		"input_image",
		"init_image",
		"reference_image",
		"conditioning_image",
	];

	for (const paramName of imageParamNames) {
		const param = inputProperties[paramName] as Record<string, unknown> | undefined;
		if (param) {
			const paramType = param.type;
			if (paramType === "string" || param.format === "uri" || paramType === "array") {
				return true;
			}
		}
	}

	return false;
}

function getInputProperties(
	latestVersion?: ReplicateModel["latest_version"],
): Record<string, unknown> | undefined {
	const openAPISchema = latestVersion?.openapi_schema;
	const components = openAPISchema?.components as Record<string, unknown> | undefined;
	const schemas = components?.schemas as Record<string, unknown> | undefined;
	const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
	return inputSchema?.properties as Record<string, unknown> | undefined;
}

// ============================================================================
// OPENAI - FETCH ALL (API doesn't return capability data for individual models)
// ============================================================================

type OpenAIModel = {
	id: string;
	object: "model";
	created?: number;
	owned_by?: string;
	features?: string[];
	groups?: string[];
	max_tokens?: number;
};

/**
 * Fetch all OpenAI models and filter to chat models.
 * The OpenAI API doesn't return capability data for individual model requests,
 * so we must fetch all and use pattern matching.
 */
export async function fetchOpenAIModels(
	apiKey: string,
): Promise<TextModelCapabilities[]> {
	try {
		const response = await fetch("https://api.openai.com/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status}`);
		}

		const data = await response.json();

		return data.data
			.filter((model: OpenAIModel) => {
				const modelId = model.id;
				if (
					modelId.includes("whisper") ||
					modelId.includes("tts") ||
					modelId.includes("dall-e") ||
					modelId.includes("embedding") ||
					modelId.includes("moderation") ||
					modelId.includes("babbage") ||
					modelId.includes("davinci") ||
					modelId.includes("turbo-instruct")
				) {
					return false;
				}
				return (
					modelId.startsWith("gpt-3.5-turbo") ||
					modelId.startsWith("gpt-4") ||
					modelId.startsWith("o1-") ||
					modelId.startsWith("o3-") ||
					modelId.startsWith("o4-") ||
					modelId.includes("chatgpt")
				);
			})
			.map((model: OpenAIModel) => {
				const modelId = model.id;
				const features = model.features || [];
				const groups = model.groups || [];
				const hasEnhancedData = features.length > 0 || groups.length > 0;

				const modelSupportsReasoning = hasEnhancedData
					? groups.includes("reasoning") ||
						features.includes("reasoning_effort") ||
						features.includes("detailed_reasoning_summary")
					: supportsReasoning("openai", modelId);

				const supportsTools = hasEnhancedData
					? features.includes("function_calling") ||
						features.includes("parallel_tool_calls")
					: modelId.startsWith("gpt-");

				const supportsImages = hasEnhancedData
					? features.includes("image_content")
					: modelId.includes("vision") || modelId.startsWith("gpt-4");

				const supportsFiles = hasEnhancedData
					? features.includes("file_content") ||
						features.includes("file_search") ||
						supportsImages
					: supportsImages || modelId.startsWith("gpt-4");

				const contextLength =
					hasEnhancedData && model.max_tokens
						? model.max_tokens
						: getOpenAIContextWindow(modelId);

				return {
					modelId,
					name: generateOpenAIDisplayName(modelId),
					provider: "openai",
					contextLength,
					supportsReasoning: modelSupportsReasoning,
					supportsTools,
					supportsImages,
					supportsFiles,
				};
			});
	} catch (error) {
		console.error("Failed to fetch OpenAI models", error);
		return [];
	}
}

function getOpenAIContextWindow(modelId: string): number {
	if (modelId.includes("gpt-4o")) {
		return 128000;
	}
	if (modelId.includes("gpt-4-turbo")) {
		return 128000;
	}
	if (modelId.includes("gpt-4")) {
		return 8192;
	}
	if (modelId.includes("gpt-3.5-turbo")) {
		return 16385;
	}
	if (modelId.includes("o1-")) {
		return 200000;
	}
	return 4096;
}

function generateOpenAIDisplayName(modelId: string): string {
	if (modelId === "chatgpt-4o-latest") {
		return "ChatGPT 4o (Latest)";
	}
	if (modelId.startsWith("gpt-4.5")) {
		return modelId.replace("gpt-4.5", "GPT-4.5");
	}
	if (modelId.startsWith("gpt-4.1")) {
		return modelId.replace("gpt-4.1", "GPT-4.1");
	}
	if (modelId.startsWith("gpt-4o")) {
		return modelId.replace("gpt-4o", "GPT-4o");
	}
	if (modelId.startsWith("gpt-4")) {
		return modelId.replace("gpt-4", "GPT-4");
	}
	if (modelId.startsWith("gpt-3.5")) {
		return modelId.replace("gpt-3.5", "GPT-3.5");
	}
	if (modelId.startsWith("o4")) {
		return modelId.replace("o4", "o4");
	}
	if (modelId.startsWith("o3")) {
		return modelId.replace("o3", "o3");
	}
	if (modelId.startsWith("o1")) {
		return modelId.replace("o1", "o1");
	}
	return modelId
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

// ============================================================================
// ANTHROPIC - FETCH ALL
// ============================================================================

/**
 * Fetch all Anthropic models.
 * The API only returns basic metadata, so capabilities are inferred.
 */
export async function fetchAnthropicModels(
	apiKey: string,
): Promise<TextModelCapabilities[]> {
	try {
		const response = await fetch("https://api.anthropic.com/v1/models", {
			headers: {
				"x-api-key": apiKey,
				"Content-Type": "application/json",
				"anthropic-version": "2023-06-01",
			},
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		const data = await response.json();
		return data.data.map(
			(model: { id: string; display_name?: string }) => {
				const modelId = model.id;
				const displayName = model.display_name || model.id;

				return {
					modelId,
					name: displayName,
					provider: "anthropic",
					contextLength: getAnthropicContextWindow(modelId),
					supportsReasoning: supportsReasoning("anthropic", modelId),
					supportsTools: true, // All modern Claude models support tools
					supportsImages: true, // All modern Claude models support images
					supportsFiles: true, // All modern Claude models support files
				};
			},
		);
	} catch (error) {
		console.error("Failed to fetch Anthropic models", error);
		return [];
	}
}

function getAnthropicContextWindow(modelId: string): number {
	if (modelId.includes("claude-3.7")) {
		return 200000;
	}
	if (modelId.includes("claude-3.5")) {
		return 200000;
	}
	if (modelId.includes("claude-3")) {
		return 200000;
	}
	if (modelId.includes("claude-2")) {
		return 100000;
	}
	return 200000;
}

// ============================================================================
// GROQ - FETCH ALL
// ============================================================================

const GROQ_MODEL_CAPABILITIES: Record<
	string,
	{
		name: string;
		contextWindow: number;
		supportsImages: boolean;
		supportsTools: boolean;
		supportsFiles: boolean;
	}
> = {
	"llama-3.1-8b-instant": {
		name: "Llama 3.1 8B Instant",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
	"llama-3.3-70b-versatile": {
		name: "Llama 3.3 70B Versatile",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
	"meta-llama/llama-guard-4-12b": {
		name: "Llama Guard 4 12B",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: false,
		supportsFiles: true,
	},
	"openai/gpt-oss-120b": {
		name: "GPT OSS 120B",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
	"openai/gpt-oss-20b": {
		name: "GPT OSS 20B",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
	"groq/compound": {
		name: "Groq Compound",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
	"groq/compound-mini": {
		name: "Groq Compound Mini",
		contextWindow: 131072,
		supportsImages: false,
		supportsTools: true,
		supportsFiles: false,
	},
};

/**
 * Fetch all Groq models.
 * Uses hardcoded capability data + pattern matching.
 */
export async function fetchGroqModels(
	apiKey: string,
): Promise<TextModelCapabilities[]> {
	try {
		const response = await fetch("https://api.groq.com/openai/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Groq API error: ${response.status}`);
		}

		const data = await response.json();
		const apiModels = Array.isArray(data.data) ? data.data : [];

		const chatModels = apiModels.filter((model: { id?: string }) => {
			if (typeof model?.id !== "string") {
				return false;
			}
			return !model.id.includes("whisper");
		});

		return chatModels.map((model: { id: string }) => {
			const modelId = model.id;
			const capabilities = GROQ_MODEL_CAPABILITIES[modelId];

			if (capabilities) {
				return {
					modelId,
					name: capabilities.name,
					provider: "groq",
					contextLength: capabilities.contextWindow,
					supportsReasoning: supportsReasoning("groq", modelId),
					supportsTools: capabilities.supportsTools,
					supportsImages: capabilities.supportsImages,
					supportsFiles: capabilities.supportsFiles,
				};
			}

			const isVision = /(vision|multimodal|image)/i.test(modelId);
			const hasTools =
				/llama|mixtral|mistral|qwen|deepseek|gemma|phi|command|it|instruct|gpt/i.test(
					modelId,
				);

			const ctxMatch = modelId.match(/-(\d{4,6})(?:$|[^\d])/);
			const ctxGroup = ctxMatch?.[1];
			const inferredCtx = ctxGroup ? Number.parseInt(ctxGroup, 10) : 131072;

			return {
				modelId,
				name: modelId,
				provider: "groq",
				contextLength: Number.isFinite(inferredCtx) ? inferredCtx : 131072,
				supportsReasoning: supportsReasoning("groq", modelId),
				supportsTools: hasTools,
				supportsImages: isVision,
				supportsFiles: isVision,
			};
		});
	} catch (error) {
		console.error("Failed to fetch Groq models", error);
		return Object.entries(GROQ_MODEL_CAPABILITIES).map(([modelId, capabilities]) => ({
			modelId,
			name: capabilities.name,
			provider: "groq",
			contextLength: capabilities.contextWindow,
			supportsReasoning: supportsReasoning("groq", modelId),
			supportsTools: capabilities.supportsTools,
			supportsImages: capabilities.supportsImages,
			supportsFiles: capabilities.supportsFiles,
		}));
	}
}

// ============================================================================
// MOONSHOT - FETCH ALL (OpenAI-compatible API)
// ============================================================================

type MoonshotModel = {
	id: string;
	object: "model";
	owned_by: string;
	context_length: number;
};

/**
 * Fetch all Moonshot models.
 * Uses OpenAI-compatible API format. Context length provided directly by API.
 */
export async function fetchMoonshotModels(
	apiKey: string,
): Promise<TextModelCapabilities[]> {
	try {
		const response = await fetch("https://api.moonshot.ai/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Moonshot API error: ${response.status}`);
		}

		const data = await response.json();
		const models = Array.isArray(data.data) ? data.data : [];

		return models.map((model: MoonshotModel) => {
			const modelId = model.id;

			// Detect capabilities from model ID patterns
			const hasVision = modelId.includes("vision");
			const hasReasoning = modelId.includes("thinking");

			return {
				modelId,
				name: generateMoonshotDisplayName(modelId),
				provider: "moonshot",
				contextLength: model.context_length || 32768,
				supportsReasoning: hasReasoning,
				supportsTools: true, // All Moonshot models support tool calling
				supportsImages: hasVision,
				supportsFiles: model.context_length >= 32000,
			};
		});
	} catch (error) {
		console.error("Failed to fetch Moonshot models", error);
		return [];
	}
}

function generateMoonshotDisplayName(modelId: string): string {
	// kimi-k2-turbo-preview -> Kimi K2 Turbo Preview
	// moonshot-v1-128k -> Moonshot V1 128K
	// kimi-k2-thinking-turbo -> Kimi K2 Thinking Turbo
	return modelId
		.split("-")
		.map((part) => {
			// Handle special cases
			if (part.toLowerCase() === "v1") {
				return "V1";
			}
			if (/^\d+k$/i.test(part)) {
				return part.toUpperCase();
			}
			// Capitalize first letter
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(" ");
}

// ============================================================================
// OPENROUTER - FETCH ALL
// ============================================================================

type OpenRouterModel = {
	id: string;
	name: string;
	context_length: number;
	architecture?: {
		input_modalities?: string[];
	};
	pricing?: {
		internal_reasoning?: string;
	};
	supported_parameters?: string[];
};

/**
 * Fetch all OpenRouter models.
 * OpenRouter has excellent capability data in their API.
 */
export async function fetchOpenRouterModels(
	apiKey: string,
): Promise<TextModelCapabilities[]> {
	try {
		const response = await fetch("https://openrouter.ai/api/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`OpenRouter API error: ${response.status}`);
		}

		const data = await response.json();

		return data.data.map((model: OpenRouterModel) => {
			const supportsReasoningViaParams =
				model.supported_parameters?.includes("reasoning") ||
				model.supported_parameters?.includes("include_reasoning");

			const supportsReasoningViaPricing =
				model.pricing?.internal_reasoning !== "0" &&
				model.pricing?.internal_reasoning !== undefined;

			const supportsReasoningViaCentralized = supportsReasoning("openrouter", model.id);

			const modelSupportsReasoning =
				supportsReasoningViaParams ||
				supportsReasoningViaPricing ||
				supportsReasoningViaCentralized;

			const supportsTools =
				model.supported_parameters?.includes("tools") ||
				model.supported_parameters?.includes("tool_choice");

			const supportsImages =
				model.architecture?.input_modalities?.includes("image") ||
				model.architecture?.input_modalities?.includes("file");

			const supportsFiles =
				model.architecture?.input_modalities?.includes("file") ||
				model.context_length >= 32000;

			return {
				modelId: model.id,
				name: model.name || model.id,
				provider: "openrouter",
				contextLength: model.context_length || 4096,
				supportsReasoning: modelSupportsReasoning,
				supportsTools: !!supportsTools,
				supportsImages: !!supportsImages,
				supportsFiles: !!supportsFiles,
			};
		});
	} catch (error) {
		console.error("Failed to fetch OpenRouter models", error);
		return [];
	}
}
