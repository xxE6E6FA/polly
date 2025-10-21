/**
 * Provider-related constants and configuration
 */

export const PROVIDER_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  openrouter: "OpenRouter",
  elevenlabs: "ElevenLabs",
} as const;

export type ProviderType = keyof typeof PROVIDER_NAMES;

// Centralized provider configuration for UI display
export const PROVIDER_CONFIG = {
  openai: { title: "OpenAI" },
  anthropic: { title: "Anthropic" },
  google: { title: "Google AI" },
  groq: { title: "Groq" },
  openrouter: { title: "OpenRouter" },
  elevenlabs: { title: "ElevenLabs" },
} as const;
