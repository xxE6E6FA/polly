/**
 * Shared reasoning configuration between Convex and client-side streaming
 * This ensures consistent reasoning behavior across both implementations
 */

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  effort?: ReasoningEffortLevel;
  maxTokens?: number;
};

export type ProviderStreamOptions =
  | Record<string, never> // Empty object for non-reasoning models
  | { openai: { reasoning: boolean } }
  | {
      google: {
        thinkingConfig: { includeThoughts: boolean; thinkingBudget?: number };
      };
    }
  | { anthropic: { thinking: { type: "enabled"; budgetTokens: number } } }
  | { extraBody: { reasoning: { effort: string; max_tokens?: number } } };

// Map effort levels to token budgets for Anthropic
export const ANTHROPIC_BUDGET_MAP = {
  low: 5000,
  medium: 10000,
  high: 20000,
} as const;

// Map effort levels to thinking budgets for Google
// Based on Google's documentation recommendations
export const GOOGLE_THINKING_BUDGET_MAP = {
  low: 1024, // Quick thinking
  medium: 4096, // Balanced thinking
  high: 8192, // Deep thinking
} as const;

/**
 * Generic function to get provider reasoning config with custom capability checking
 * @param provider - The AI provider name
 * @param model - The model identifier
 * @param reasoningConfig - Optional reasoning configuration
 * @param hasCapability - Function to check if model has reasoning capability
 * @returns Provider-specific stream options
 */
export function getProviderReasoningConfigWithChecker(
  provider: string,
  model: string,
  reasoningConfig: ReasoningConfig | undefined,
  hasCapability: boolean
): ProviderStreamOptions {
  if (!hasCapability) {
    return {};
  }

  // Special handling for Google models
  if (provider === "google") {
    // Gemini 2.5 Pro doesn't allow reasoning to be disabled
    if (model.toLowerCase().includes("gemini-2.5-pro")) {
      // Force enable reasoning for 2.5 Pro regardless of config
      return getProviderReasoningOptions(provider, {
        effort: reasoningConfig?.effort ?? "medium",
        maxTokens: reasoningConfig?.maxTokens,
      });
    }

    // For other Google models, handle disabled reasoning
    if (!reasoningConfig) {
      // For Google models, we need to explicitly disable thinking
      // especially for Flash Lite which doesn't think by default
      return {
        google: {
          thinkingConfig: {
            includeThoughts: false,
            thinkingBudget: 0,
          },
        },
      };
    }
  }

  // Delegate to shared implementation
  return getProviderReasoningOptions(provider, reasoningConfig);
}

/**
 * Get provider-specific reasoning configuration
 * @param provider - The AI provider name
 * @param reasoningConfig - Optional reasoning configuration
 * @returns Provider-specific stream options
 */
export function getProviderReasoningOptions(
  provider: string,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  // Note: This function assumes the caller has already verified
  // that the model supports reasoning using their capability detection system

  switch (provider) {
    case "openai":
      return {
        openai: {
          reasoning: true,
        },
      };

    case "google": {
      const thinkingConfig: {
        includeThoughts: boolean;
        thinkingBudget?: number;
      } = {
        includeThoughts: true, // Required for reasoning to actually stream
        // Use explicit budget from config or map from effort level
        thinkingBudget:
          reasoningConfig?.maxTokens ??
          GOOGLE_THINKING_BUDGET_MAP[reasoningConfig?.effort ?? "medium"],
      };

      return {
        google: {
          thinkingConfig,
        },
      };
    }

    case "anthropic": {
      const budgetTokens =
        reasoningConfig?.maxTokens ??
        ANTHROPIC_BUDGET_MAP[reasoningConfig?.effort ?? "medium"];

      return {
        anthropic: {
          thinking: {
            type: "enabled",
            budgetTokens,
          },
        },
      };
    }

    case "openrouter":
      return {
        extraBody: {
          reasoning: {
            effort: reasoningConfig?.effort ?? "medium",
            ...(reasoningConfig?.maxTokens && {
              max_tokens: reasoningConfig.maxTokens,
            }),
          },
        },
      };

    default:
      return {};
  }
}

/**
 * Extract reasoning effort level from various formats
 */
export function normalizeReasoningEffort(
  effort?: string | ReasoningEffortLevel
): ReasoningEffortLevel {
  if (!effort) return "medium";

  const normalizedEffort = effort.toLowerCase();
  if (
    normalizedEffort === "low" ||
    normalizedEffort === "medium" ||
    normalizedEffort === "high"
  ) {
    return normalizedEffort;
  }

  return "medium";
}
