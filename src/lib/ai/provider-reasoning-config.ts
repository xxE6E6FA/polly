import { type AIProvider } from "./client-ai-service";
import { hasReasoningCapabilities } from "@/lib/model-capabilities";
import {
  getProviderReasoningConfigWithChecker,
  type ReasoningConfig,
  type ProviderStreamOptions,
} from "../../../convex/lib/shared/reasoning_config";

/**
 * Client-specific wrapper for provider reasoning configuration
 * Uses capability detection from the model capabilities
 */
export function getProviderReasoningConfig(
  provider: AIProvider,
  model: string,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  // Use client-specific capability detection with proper model object
  const isReasoningModel = hasReasoningCapabilities({
    modelId: model,
    provider: provider,
    name: "", // Not needed for capability detection
  });

  // Delegate to shared implementation
  return getProviderReasoningConfigWithChecker(
    provider,
    model,
    reasoningConfig,
    isReasoningModel
  );
}

/**
 * Check if a model supports reasoning using client-side detection
 */
export function supportsReasoning(
  provider: AIProvider,
  model: string
): boolean {
  // Use client-specific capability detection
  return hasReasoningCapabilities({
    modelId: model,
    provider: provider,
    name: "",
  });
}

/**
 * Get the expected reasoning event types for a provider
 * This helps with debugging and validation
 */
export function getReasoningEventTypes(provider: AIProvider): string[] {
  switch (provider) {
    case "anthropic":
      return ["thinking_delta", "reasoning"];
    case "google":
      return ["thinking_delta", "reasoning"];
    case "openai":
      return ["reasoning"];
    case "openrouter":
      return ["reasoning", "thinking_delta"];
    default:
      return [];
  }
}
