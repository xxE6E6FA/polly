import { mapPollyModelToProvider } from "./constants";

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  effort?: ReasoningEffortLevel;
  maxTokens?: number;
};

export type ModelWithCapabilities = {
  modelId: string;
  provider: string;
  supportsReasoning?: boolean;
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
export const GOOGLE_THINKING_BUDGET_MAP = {
  low: 1024,
  medium: 4096,
  high: 8192,
} as const;

export function getProviderReasoningConfig(
  model: ModelWithCapabilities,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  const { provider, modelId, supportsReasoning } = model;

  if (!supportsReasoning) {
    return {};
  }

  // Handle Polly provider mapping
  let actualProvider = provider;
  if (provider === "polly") {
    actualProvider = mapPollyModelToProvider(modelId);
  }

  // Special handling for Google models
  if (actualProvider === "google") {
    // Gemini 2.5 Pro enforces reasoning - it cannot be disabled
    if (modelId.toLowerCase().includes("gemini-2.5-pro")) {
      // Always enable reasoning for 2.5 Pro, using provided config or defaults
      return getProviderReasoningOptions(
        actualProvider,
        reasoningConfig || {
          effort: "medium",
        }
      );
    }

    if (!reasoningConfig) {
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

  // Handle OpenAI o1 models that enforce reasoning
  if (
    actualProvider === "openai" &&
    (modelId.toLowerCase().includes("o1-") ||
      modelId.toLowerCase().includes("o3-") ||
      modelId.toLowerCase().includes("o4"))
  ) {
    // Always enable reasoning for o1/o3/o4 models
    return getProviderReasoningOptions(
      actualProvider,
      reasoningConfig || {
        effort: "medium",
      }
    );
  }

  // Delegate to shared implementation
  return getProviderReasoningOptions(actualProvider, reasoningConfig);
}

export function getProviderReasoningOptions(
  provider: string,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
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
        includeThoughts: true,
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