/**
 * Built-in text model configurations.
 *
 * Minimal config - only specify provider + modelId + free.
 * Capabilities (contextLength, supportsImages, etc.) are auto-discovered from provider APIs.
 */

export type TextModelConfig = {
	/** Model ID as recognized by the provider (e.g., "gemini-2.5-flash-lite") */
	modelId: string;
	/** Provider name */
	provider: "google" | "openai" | "anthropic" | "groq" | "openrouter";
	/** Whether this model is free to use (no API key required from user) */
	free: boolean;
	/** Optional display name override (auto-discovered if not set) */
	name?: string;
	/** Whether this model is active (default: true) */
	isActive?: boolean;
};

/**
 * List of built-in text models.
 * Add models here - capabilities are auto-discovered from provider APIs at seed time.
 */
export const builtInTextModels: TextModelConfig[] = [
	{
		modelId: "gemini-2.5-flash-lite",
		provider: "google",
		free: true,
	},
	// Add more built-in models here
	// Example:
	// { modelId: "gpt-4o-mini", provider: "openai", free: true },
	// { modelId: "claude-3-haiku-20240307", provider: "anthropic", free: true },
];
