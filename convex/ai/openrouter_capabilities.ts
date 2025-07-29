import { log } from "../lib/logger";

export interface OpenRouterModel {
  id: string;
  name: string;
  supported_parameters?: string[];
  pricing?: {
    internal_reasoning?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

let modelCapabilitiesCache: Map<string, boolean> | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 1000 * 60 * 60;

async function fetchOpenRouterCapabilities(): Promise<Map<string, boolean>> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data: OpenRouterModelsResponse = await response.json();
    const capabilities = new Map<string, boolean>();

    for (const model of data.data) {
      // A model supports reasoning if it has "reasoning" or "include_reasoning" in supported_parameters
      const supportsReasoning =
        model.supported_parameters?.some(
          param => param === "reasoning" || param === "include_reasoning"
        ) ?? false;

      capabilities.set(model.id, supportsReasoning);
    }

    return capabilities;
  } catch (error) {
          log.warn("Failed to fetch OpenRouter capabilities:", error);
    // Return empty map on error - will fall back to pattern matching
    return new Map();
  }
}

export async function checkOpenRouterReasoningSupport(
  modelId: string
): Promise<boolean> {
  const now = Date.now();

  // Use cache if valid
  if (modelCapabilitiesCache && now < cacheExpiry) {
    const cached = modelCapabilitiesCache.get(modelId);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Refresh cache if expired or missing
  if (!modelCapabilitiesCache || now >= cacheExpiry) {
    try {
      modelCapabilitiesCache = await fetchOpenRouterCapabilities();
      cacheExpiry = now + CACHE_DURATION;
    } catch (error) {
      log.warn("Failed to refresh OpenRouter capabilities cache:", error);
    }
  }

  // Check cache again after refresh
  if (modelCapabilitiesCache?.has(modelId)) {
    return modelCapabilitiesCache.get(modelId) ?? false;
  }

  // Fallback to pattern matching for unknown models
  return fallbackPatternMatch(modelId);
}

function fallbackPatternMatch(modelId: string): boolean {
  const reasoningPatterns = [
    "o1-",
    "o3-",
    "o4-",
    "deepseek-r1",
    "deepseek/deepseek-r1",
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-3-7-sonnet",
    "gemini-2.5",
    "qwen3-235b",
    "qwen/qwen3-235b",
    "reasoning",
    "thinking",
  ];

  return reasoningPatterns.some(pattern => modelId.includes(pattern));
}

/**
 * Clear the cache (useful for testing)
 */
export function clearOpenRouterCache(): void {
  modelCapabilitiesCache = null;
  cacheExpiry = 0;
}
