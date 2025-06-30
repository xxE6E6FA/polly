import { getCapabilityFromPatterns } from "./model_capabilities_config";
import {
  getProviderReasoningConfigWithChecker,
  type ReasoningConfig,
  type ProviderStreamOptions,
} from "./shared/reasoning_config";

/**
 * Convex-specific wrapper for provider reasoning configuration
 * Uses capability detection from the model capabilities config
 */
export function getProviderReasoningConfig(
  provider: string,
  model: string,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  // Use Convex-specific capability detection
  const hasCapability = getCapabilityFromPatterns(
    "supportsReasoning",
    provider,
    model
  );

  // Delegate to shared implementation
  return getProviderReasoningConfigWithChecker(
    provider,
    model,
    reasoningConfig,
    hasCapability
  );
}

/**
 * Check if a provider supports reasoning with the given model
 */
export function supportsReasoning(provider: string, model: string): boolean {
  return getCapabilityFromPatterns("supportsReasoning", provider, model);
}
