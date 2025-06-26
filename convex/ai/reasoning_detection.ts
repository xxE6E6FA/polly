import { getCapabilityFromPatterns } from "../lib/model_capabilities_config";
import { checkOpenRouterReasoningSupport } from "./openrouter_capabilities";

export async function isReasoningModelEnhanced(
  provider: string,
  model: string
): Promise<boolean> {
  // For OpenRouter, use dynamic API checking
  if (provider === "openrouter") {
    try {
      return await checkOpenRouterReasoningSupport(model);
    } catch (error) {
      console.warn(
        "Failed to check OpenRouter reasoning support, falling back to patterns:",
        error
      );
      // Fall back to pattern matching
      return getCapabilityFromPatterns("supportsReasoning", provider, model);
    }
  }

  // For other providers, use pattern matching
  return getCapabilityFromPatterns("supportsReasoning", provider, model);
}

/**
 * Synchronous version for backward compatibility
 * Uses pattern matching only
 */
export function isReasoningModel(provider: string, model: string): boolean {
  return getCapabilityFromPatterns("supportsReasoning", provider, model);
}
