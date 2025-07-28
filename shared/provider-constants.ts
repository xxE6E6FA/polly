/**
 * Provider-related constants and configuration
 */

export const PROVIDER_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic", 
  google: "Google",
  openrouter: "OpenRouter",
} as const;

export type ProviderType = keyof typeof PROVIDER_NAMES;

// Centralized provider configuration for UI display
export const PROVIDER_CONFIG = {
  openai: { title: "OpenAI" },
  anthropic: { title: "Anthropic" },
  google: { title: "Google AI" },
  openrouter: { title: "OpenRouter" },
} as const; 