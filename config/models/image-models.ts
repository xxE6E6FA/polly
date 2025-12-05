/**
 * Built-in image model configurations.
 *
 * Minimal config - only specify provider + modelId + free.
 * Capabilities (aspectRatios, supportsNegativePrompt, etc.) are auto-discovered from Replicate API.
 */

export type ImageModelConfig = {
	/** Model ID in owner/name format (e.g., "black-forest-labs/flux-schnell") */
	modelId: string;
	/** Provider name (currently only Replicate is supported for image generation) */
	provider: "replicate";
	/** Whether this model is free to use (no API key required from user) */
	free: boolean;
	/** Optional display name override (auto-discovered if not set) */
	name?: string;
	/** Whether this model is active (default: true) */
	isActive?: boolean;
};

/**
 * List of built-in image generation models.
 * Add models here - capabilities are auto-discovered from Replicate API at seed time.
 */
export const builtInImageModels: ImageModelConfig[] = [
	{
		modelId: "black-forest-labs/flux-schnell",
		provider: "replicate",
		free: true,
	},
	// Add more built-in image models here
	// Example:
	// { modelId: "stability-ai/sdxl", provider: "replicate", free: true },
];
