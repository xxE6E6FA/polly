/**
 * Mapping between Polly provider IDs and models.dev provider IDs.
 *
 * models.dev uses its own provider identifiers that may differ from
 * what we use internally. This mapping allows us to:
 * 1. Fetch data from models.dev using their provider IDs
 * 2. Map back to our internal provider IDs when storing/querying
 */

/**
 * Polly provider ID → models.dev provider IDs (may be multiple)
 * Some providers have multiple identifiers in models.dev
 */
export const POLLY_TO_MODELSDEV_PROVIDER: Record<string, string[]> = {
  google: ["google"],
  openai: ["openai"],
  anthropic: ["anthropic"],
  groq: ["groq"],
  openrouter: ["openrouter"],
  moonshot: ["moonshotai"],
};

/**
 * models.dev provider ID → Polly provider ID
 * Reverse mapping for when we receive data from models.dev
 */
export const MODELSDEV_TO_POLLY_PROVIDER: Record<string, string> = {
  google: "google",
  openai: "openai",
  anthropic: "anthropic",
  groq: "groq",
  openrouter: "openrouter",
  moonshotai: "moonshot",
};

/**
 * All supported Polly providers that have models.dev mappings
 */
export const SUPPORTED_PROVIDERS = Object.keys(
  POLLY_TO_MODELSDEV_PROVIDER
) as Array<keyof typeof POLLY_TO_MODELSDEV_PROVIDER>;

/**
 * Get models.dev provider IDs for a Polly provider
 */
export function getModelsDevProviders(pollyProvider: string): string[] {
  return POLLY_TO_MODELSDEV_PROVIDER[pollyProvider] ?? [];
}

/**
 * Get Polly provider ID from a models.dev provider ID
 */
export function getPollyProvider(modelsDevProvider: string): string | null {
  return MODELSDEV_TO_POLLY_PROVIDER[modelsDevProvider] ?? null;
}
