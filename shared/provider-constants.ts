/**
 * Provider-related constants
 */

export const PROVIDER_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  polly: "Polly",
} as const;

export type ProviderType = keyof typeof PROVIDER_NAMES; 