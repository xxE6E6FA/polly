// Re-export from centralized reasoning detection
export { 
  supportsReasoning as isReasoningModel, 
  getModelReasoningInfo,
  hasMandatoryReasoning,
  hasOptionalReasoning,
} from "../../shared/reasoning-model-detection";

import { checkOpenRouterReasoningSupport } from "./openrouter_capabilities";

/**
 * Enhanced reasoning detection that includes OpenRouter API checking
 */
export async function isReasoningModelWithApiCheck(
  provider: string,
  model: string
): Promise<boolean> {
  // Import here to avoid circular dependencies  
  const { supportsReasoning } = require("../../shared/reasoning-model-detection");
  
  // For OpenRouter, use dynamic API checking when available
  if (provider === "openrouter") {
    try {
      return await checkOpenRouterReasoningSupport(model);
    } catch (error) {
      console.warn(
        "Failed to check OpenRouter reasoning support, falling back to pattern matching:",
        error
      );
      // Fall back to pattern-based detection
      return supportsReasoning(provider, model);
    }
  }

  // For other providers, use centralized detection
  return supportsReasoning(provider, model);
}
