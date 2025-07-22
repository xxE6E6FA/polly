import { hasMandatoryReasoning } from "../lib/model_capabilities_config";
import { checkOpenRouterReasoningSupport } from "./openrouter_capabilities";

/**
 * Check if a Google model supports reasoning (including optional reasoning)
 */
function supportsGoogleReasoning(model: string): boolean {
  const modelLower = model.toLowerCase();

  // Gemini 2.5 models support reasoning
  if (modelLower.includes("gemini-2.5")) {
    return true;
  }

  // Other known reasoning-capable Google models can be added here
  // For now, be conservative and only include 2.5 series

  return false;
}

export async function isReasoningModel(
  provider: string,
  model: string
): Promise<boolean> {
  // For OpenRouter, use dynamic API checking
  if (provider === "openrouter") {
    try {
      return await checkOpenRouterReasoningSupport(model);
    } catch (error) {
      console.warn(
        "Failed to check OpenRouter reasoning support, falling back to mandatory patterns:",
        error
      );
      // Fall back to mandatory reasoning patterns only
      return hasMandatoryReasoning(provider, model);
    }
  }

  // For Google models, check both mandatory and optional reasoning support
  if (provider === "google") {
    return (
      hasMandatoryReasoning(provider, model) || supportsGoogleReasoning(model)
    );
  }

  // For other providers, use mandatory reasoning patterns only
  return hasMandatoryReasoning(provider, model);
}
