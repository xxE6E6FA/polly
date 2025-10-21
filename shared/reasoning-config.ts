import { getModelReasoningInfo } from "./reasoning-model-detection";

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  effort?: ReasoningEffortLevel;
  maxTokens?: number;
  enabled?: boolean; // Added for explicit enable/disable
};

export type ModelWithCapabilities = {
  modelId: string;
  provider: string;
  supportsReasoning?: boolean;
};

type OpenRouterReasoningOptions = {
  effort?: "low" | "medium" | "high";
  exclude?: boolean;
  enabled?: boolean;
} & Partial<Record<"max_tokens", number>>;

export type ProviderStreamOptions =
  | Record<string, never> // Empty object for non-reasoning models
  | { openai: { reasoning: boolean } }
  | {
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: number;
            includeThoughts?: boolean;
          };
        };
      };
    }
  | { anthropic: { thinking: { type: "enabled"; budgetTokens: number } } }
  | {
      providerOptions: {
        groq: {
          reasoningFormat: "parsed";
          reasoningEffort: "low" | "default" | "high";
          maxOutputTokens?: number;
          parallelToolCalls: boolean;
        };
      };
    }
  | {
      extraBody: {
        reasoning: OpenRouterReasoningOptions;
      };
    };

export const ANTHROPIC_BUDGET_MAP = {
  low: 5000,
  medium: 10000,
  high: 20000,
} as const;

export const GOOGLE_THINKING_BUDGET_MAP = {
  low: 1024,
  medium: 4096,
  high: 8192,
} as const;

export function getProviderReasoningConfig(
  model: ModelWithCapabilities,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  const {
    provider,
    modelId,
    supportsReasoning: modelSupportsReasoning,
  } = model;

  // Use centralized reasoning detection
  const reasoningInfo = getModelReasoningInfo(provider, modelId);

  // If model doesn't support reasoning at all, return empty config
  if (!(reasoningInfo.supportsReasoning || modelSupportsReasoning)) {
    return {};
  }

  // Handle built-in provider mapping - use provider as-is since it should already be resolved
  const actualProvider = provider;

  // For models with mandatory reasoning or special handling requirements
  if (
    reasoningInfo.needsSpecialHandling ||
    reasoningInfo.reasoningType === "mandatory"
  ) {
    return getProviderReasoningOptions(
      actualProvider,
      reasoningConfig || {
        effort: "medium",
      }
    );
  }

  // For all other models (optional or unknown), only enable if explicitly requested
  if (
    !reasoningConfig ||
    reasoningConfig.enabled === false ||
    !(
      reasoningConfig.enabled ||
      reasoningConfig.effort ||
      reasoningConfig.maxTokens
    )
  ) {
    return {}; // Simply omit reasoning settings when not enabled
  }

  // Delegate to provider-specific implementation when reasoning is explicitly enabled
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
      const thinkingBudget =
        reasoningConfig?.maxTokens ??
        GOOGLE_THINKING_BUDGET_MAP[reasoningConfig?.effort ?? "medium"];

      return {
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget,
              includeThoughts: true,
            },
          },
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

    case "groq": {
      // Groq uses providerOptions.groq for reasoning controls in AI SDK
      // We map our generic config to Groq options
      const effort = reasoningConfig?.effort ?? "medium";
      const maxTokens = reasoningConfig?.maxTokens;
      return {
        providerOptions: {
          groq: {
            reasoningFormat: "parsed",
            reasoningEffort:
              effort === "low" ? "low" : effort === "high" ? "high" : "default",
            ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
            parallelToolCalls: true,
          },
        },
      };
    }

    case "openrouter": {
      // OpenRouter's unified reasoning API supports:
      // - effort: "low", "medium", "high" (for o-series, Grok models)
      // - max_tokens: Direct token allocation (for Gemini, Anthropic models)
      // - exclude: true/false to hide reasoning from response
      // - enabled: true to use default settings
      const reasoningOptions: OpenRouterReasoningOptions = {
        exclude: false,
      };

      // Set effort level if provided (preferred for o-series and Grok models)
      if (reasoningConfig?.effort) {
        reasoningOptions.effort = reasoningConfig.effort;
      }

      // Set max tokens if provided (preferred for Gemini and Anthropic models)
      if (reasoningConfig?.maxTokens) {
        reasoningOptions["max_tokens"] = reasoningConfig.maxTokens;
      }

      // Control reasoning token visibility - set to false to include reasoning in response
      // We want reasoning tokens for our internal processing
      reasoningOptions.exclude = false;

      // Enable reasoning with provided config or use enabled: true for defaults
      const hasExplicitConfig =
        reasoningOptions.effort !== undefined ||
        reasoningOptions["max_tokens"] !== undefined;
      if (!hasExplicitConfig) {
        reasoningOptions.enabled = true;
      }

      return {
        extraBody: {
          reasoning: reasoningOptions,
        },
      };
    }

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
  if (!effort) {
    return "medium";
  }

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
