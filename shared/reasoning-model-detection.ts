/**
 * Centralized reasoning model detection and configuration
 *
 * This module consolidates all logic for detecting whether a model supports
 * reasoning capabilities and determining if reasoning is mandatory or optional.
 */

// Reasoning model patterns by category
export const MANDATORY_REASONING_PATTERNS = [
  // OpenAI o-series (reasoning required)
  "o1-",
  "o3-",
  "o4-",

  // Google Gemini 2.5 Pro (reasoning enforced)
  "gemini-2.5-pro",

  // DeepSeek reasoning models
  "deepseek-r1",

  // MiniMax reasoning models (mandatory reasoning)
  "minimax-m1",
  "minimax-01",

  // Qwen reasoning models (always-on)
  "qwen3-235b-a22b-thinking",

  // GLM reasoning models (always-on)
  "glm-4.1v-9b-thinking",

  // TNG/DeepSeek chimera models (always-on)
  "deepseek-r1t2-chimera",

  // ByteDance UI reasoning models (always-on)
  "ui-tars-1.5-7b",

  // Mistral reasoning models (always-on)
  "magistral-medium-2506",
] as const;

export const OPTIONAL_REASONING_PATTERNS = [
  // Google Gemini 2.5 Flash series (reasoning supported but can be disabled)
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",

  // Anthropic models with extended thinking
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-3-7-sonnet",
  "claude-3.7-sonnet", // Alternative naming

  // OpenRouter reasoning models (vary by model, most support effort levels or explicit max token controls)
  "qwen2.5",
  "qwen3", // Qwen3 series with thinking mode (but not the always-on variants)
  "qwen3-coder", // Qwen3 coder with optional reasoning
  "llama-3.1",
  "qwq-32b",
  "grok", // Grok supports effort levels per OpenRouter docs
  "grok-4", // Grok-4 with optional reasoning

  // Additional reasoning-capable models available via OpenRouter
  "deepthink",
  "reflection",
] as const;

// Helper function to filter patterns by provider context
function getProviderSpecificPatterns(
  patterns: readonly string[],
  provider: string
): string[] {
  if (provider === "openrouter") {
    // OpenRouter supports all patterns from all providers
    return [...patterns];
  }

  return patterns.filter(pattern => {
    const patternLower = pattern.toLowerCase();

    switch (provider) {
      case "openai":
        return (
          patternLower.includes("o1-") ||
          patternLower.includes("o3-") ||
          patternLower.includes("o4-")
        );

      case "google":
        return patternLower.includes("gemini");

      case "anthropic":
        return patternLower.includes("claude");

      case "groq":
        // Groq hosts many models; limit to well-known patterns from Groq docs
        return (
          patternLower.includes("qwen") ||
          patternLower.includes("qwq") ||
          patternLower.includes("deepseek") ||
          patternLower.includes("gpt-oss") ||
          patternLower.includes("llama") ||
          patternLower.includes("grok")
        );

      default:
        return false;
    }
  });
}

// Provider-specific reasoning configurations
export const PROVIDER_REASONING_CONFIG = {
  openai: {
    getMandatoryPatterns: () =>
      getProviderSpecificPatterns(MANDATORY_REASONING_PATTERNS, "openai"),
    getOptionalPatterns: () =>
      getProviderSpecificPatterns(OPTIONAL_REASONING_PATTERNS, "openai"),
    configFormat: { reasoning: true },
  },
  google: {
    getMandatoryPatterns: () =>
      getProviderSpecificPatterns(MANDATORY_REASONING_PATTERNS, "google"),
    getOptionalPatterns: () =>
      getProviderSpecificPatterns(OPTIONAL_REASONING_PATTERNS, "google"),
    configFormat: { thinkingConfig: { thinkingBudget: "number" } },
  },
  anthropic: {
    getMandatoryPatterns: () =>
      getProviderSpecificPatterns(MANDATORY_REASONING_PATTERNS, "anthropic"),
    getOptionalPatterns: () =>
      getProviderSpecificPatterns(OPTIONAL_REASONING_PATTERNS, "anthropic"),
    configFormat: { thinking: { type: "enabled", budgetTokens: "number" } },
  },
  openrouter: {
    getMandatoryPatterns: () =>
      getProviderSpecificPatterns(MANDATORY_REASONING_PATTERNS, "openrouter"),
    getOptionalPatterns: () =>
      getProviderSpecificPatterns(OPTIONAL_REASONING_PATTERNS, "openrouter"),
    configFormat: {
      reasoning: {
        effort: "low|medium|high",
        maxTokens: "number",
        exclude: "boolean",
        enabled: "boolean",
      },
    },
    requiresApiCheck: true, // OpenRouter needs API verification for comprehensive detection
    supportsDifferentControls: {
      effortLevels: ["o1", "o3", "o4", "grok", "grok-4"], // Models that support effort levels
      maxTokens: ["gemini", "claude", "qwen"], // Models that support direct token allocation
      allSupport: ["exclude"], // All reasoning models support excluding reasoning from response
    },
  },
} as const;

export type ProviderReasoningRequirementsResult =
  (typeof PROVIDER_REASONING_CONFIG)[keyof typeof PROVIDER_REASONING_CONFIG] & {
    mandatoryPatterns: string[];
    optionalPatterns: string[];
  };

/**
 * Check if a model has mandatory reasoning (cannot be disabled)
 */
export function hasMandatoryReasoning(
  provider: string,
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  // OpenRouter inherits patterns from other providers and extends with its own
  if (provider === "openrouter") {
    // First check OpenRouter's own mandatory patterns
    const openrouterConfig = PROVIDER_REASONING_CONFIG.openrouter;
    if (
      openrouterConfig
        .getMandatoryPatterns()
        .some(pattern => modelIdLower.includes(pattern.toLowerCase()))
    ) {
      return true;
    }

    // Then check all other providers' mandatory patterns (inheritance)
    for (const [providerKey, config] of Object.entries(
      PROVIDER_REASONING_CONFIG
    )) {
      if (providerKey !== "openrouter") {
        const hasProviderPattern = config
          .getMandatoryPatterns()
          .some(pattern => modelIdLower.includes(pattern.toLowerCase()));
        if (hasProviderPattern) {
          return true;
        }
      }
    }

    // Also check global mandatory patterns
    return MANDATORY_REASONING_PATTERNS.some(pattern =>
      modelIdLower.includes(pattern.toLowerCase())
    );
  }

  // Check provider-specific mandatory patterns
  const providerConfig =
    PROVIDER_REASONING_CONFIG[
      provider as keyof typeof PROVIDER_REASONING_CONFIG
    ];
  if (providerConfig?.getMandatoryPatterns) {
    const hasProviderPattern = providerConfig
      .getMandatoryPatterns()
      .some(pattern => modelIdLower.includes(pattern.toLowerCase()));
    if (hasProviderPattern) {
      return true;
    }
  }

  // Check global mandatory patterns
  return MANDATORY_REASONING_PATTERNS.some(pattern =>
    modelIdLower.includes(pattern.toLowerCase())
  );
}

/**
 * Check if a model supports optional reasoning
 */
export function hasOptionalReasoning(
  provider: string,
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  // OpenRouter inherits patterns from other providers and extends with its own
  if (provider === "openrouter") {
    // First check OpenRouter's own optional patterns
    const openrouterConfig = PROVIDER_REASONING_CONFIG.openrouter;
    if (
      openrouterConfig
        .getOptionalPatterns()
        .some(pattern => modelIdLower.includes(pattern.toLowerCase()))
    ) {
      return true;
    }

    // Then check all other providers' optional patterns (inheritance)
    for (const [providerKey, config] of Object.entries(
      PROVIDER_REASONING_CONFIG
    )) {
      if (providerKey !== "openrouter") {
        const hasProviderPattern = config
          .getOptionalPatterns()
          .some(pattern => modelIdLower.includes(pattern.toLowerCase()));
        if (hasProviderPattern) {
          return true;
        }
      }
    }

    // Also check global optional patterns
    return OPTIONAL_REASONING_PATTERNS.some(pattern =>
      modelIdLower.includes(pattern.toLowerCase())
    );
  }

  // Check provider-specific optional patterns
  const providerConfig =
    PROVIDER_REASONING_CONFIG[
      provider as keyof typeof PROVIDER_REASONING_CONFIG
    ];
  if (providerConfig?.getOptionalPatterns) {
    const hasProviderPattern = providerConfig
      .getOptionalPatterns()
      .some(pattern => modelIdLower.includes(pattern.toLowerCase()));
    if (hasProviderPattern) {
      return true;
    }
  }

  // Check global optional patterns
  return OPTIONAL_REASONING_PATTERNS.some(pattern =>
    modelIdLower.includes(pattern.toLowerCase())
  );
}

/**
 * Check if a model supports reasoning (either mandatory or optional)
 */
export function supportsReasoning(provider: string, modelId: string): boolean {
  return (
    hasMandatoryReasoning(provider, modelId) ||
    hasOptionalReasoning(provider, modelId)
  );
}

/**
 * Get reasoning type for a model
 */
export function getReasoningType(
  provider: string,
  modelId: string
): "mandatory" | "optional" | "none" {
  if (hasMandatoryReasoning(provider, modelId)) {
    return "mandatory";
  }
  if (hasOptionalReasoning(provider, modelId)) {
    return "optional";
  }
  return "none";
}

/**
 * Special handling for provider-specific reasoning rules
 */
export function needsSpecialReasoningHandling(
  provider: string,
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  // Google Gemini 2.5 Pro enforces reasoning - it cannot be disabled
  if (provider === "google" && modelIdLower.includes("gemini-2.5-pro")) {
    return true;
  }

  // OpenAI o-series models enforce reasoning
  if (
    provider === "openai" &&
    (modelIdLower.includes("o1-") ||
      modelIdLower.includes("o3-") ||
      modelIdLower.includes("o4-"))
  ) {
    return true;
  }

  return false;
}

/**
 * Get all inherited patterns for OpenRouter
 */
export function getOpenRouterInheritedPatterns(): {
  mandatoryPatterns: string[];
  optionalPatterns: string[];
} {
  // Use the centralized arrays directly for OpenRouter since it supports all patterns
  return {
    mandatoryPatterns: [...MANDATORY_REASONING_PATTERNS],
    optionalPatterns: [...OPTIONAL_REASONING_PATTERNS],
  };
}

/**
 * Get provider-specific reasoning configuration requirements
 */
export function getProviderReasoningRequirements(
  provider: string
): ProviderReasoningRequirementsResult | null {
  const config =
    PROVIDER_REASONING_CONFIG[
      provider as keyof typeof PROVIDER_REASONING_CONFIG
    ];

  if (!config) {
    return null;
  }

  // For OpenRouter, return the full patterns from centralized arrays
  if (provider === "openrouter") {
    const inheritedPatterns = getOpenRouterInheritedPatterns();
    const requirement: ProviderReasoningRequirementsResult = {
      ...config,
      mandatoryPatterns: inheritedPatterns.mandatoryPatterns,
      optionalPatterns: inheritedPatterns.optionalPatterns,
    };
    return requirement;
  }

  // For other providers, return their specific patterns
  const requirement: ProviderReasoningRequirementsResult = {
    ...config,
    mandatoryPatterns: config.getMandatoryPatterns(),
    optionalPatterns: config.getOptionalPatterns(),
  };
  return requirement;
}

export type ReasoningModelInfo = {
  supportsReasoning: boolean;
  reasoningType: "mandatory" | "optional" | "none";
  needsSpecialHandling: boolean;
  providerConfig?: (typeof PROVIDER_REASONING_CONFIG)[keyof typeof PROVIDER_REASONING_CONFIG];
};

/**
 * Get complete reasoning information for a model
 */
export function getModelReasoningInfo(
  provider: string,
  modelId: string
): ReasoningModelInfo {
  const supportsReasoningCapability = supportsReasoning(provider, modelId);
  const reasoningType = getReasoningType(provider, modelId);
  const needsSpecialHandling = needsSpecialReasoningHandling(provider, modelId);
  const providerConfig = getProviderReasoningRequirements(provider);

  return {
    supportsReasoning: supportsReasoningCapability,
    reasoningType,
    needsSpecialHandling,
    providerConfig: providerConfig || undefined,
  };
}
