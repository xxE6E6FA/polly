import {
  getModelReasoningInfo,
  isGemini3Model,
} from "./reasoning-model-detection";

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

// Gemini 3 thinking levels (thinkingLevel parameter)
// Pro models support: low, high (default: high)
// Flash models support: minimal, low, medium, high
export type Gemini3ThinkingLevel = "minimal" | "low" | "medium" | "high";

// Gemini 2.5 uses thinkingBudget (token count)
// Gemini 3 uses thinkingLevel (categorical)
export type GoogleProviderOptions = {
  structuredOutputs?: boolean;
  thinkingConfig?: {
    // Gemini 2.5: token budget for thinking
    thinkingBudget?: number;
    // Gemini 3: categorical thinking level
    thinkingLevel?: Gemini3ThinkingLevel;
    // Whether to include thought summaries in response
    // Works properly on Gemini 3, but not on Gemini 2.5 via @ai-sdk/google
    includeThoughts?: boolean;
  };
};

export type ProviderStreamOptions =
  | Record<string, never> // Empty object for non-reasoning models
  | { openai: { reasoning: boolean } }
  | { anthropic: { thinking: { type: "enabled"; budgetTokens: number } } }
  | {
      providerOptions: {
        google?: GoogleProviderOptions;
        groq?: {
          reasoningFormat: "parsed";
          reasoningEffort: "low" | "default" | "high";
          maxOutputTokens?: number;
          parallelToolCalls: boolean;
        };
        openrouter?: {
          reasoning: OpenRouterReasoningOptions;
        };
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

  // If model doesn't support reasoning at all, return base provider options
  // (e.g., Google needs structuredOutputs: false even without reasoning)
  if (!(reasoningInfo.supportsReasoning || modelSupportsReasoning)) {
    return getProviderBaseOptions(provider);
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
      },
      modelId
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
    // Return explicit disable options for providers that auto-enable reasoning
    // (e.g., OpenRouter enables reasoning by default for capable models)
    return getReasoningDisabledOptions(actualProvider);
  }

  // Delegate to provider-specific implementation when reasoning is explicitly enabled
  return getProviderReasoningOptions(actualProvider, reasoningConfig, modelId);
}

/**
 * Map our effort levels to Gemini 3's thinkingLevel
 * Pro models only support: low, high
 * Flash models support: minimal, low, medium, high
 */
function getGemini3ThinkingLevel(
  effort: ReasoningEffortLevel,
  modelId: string
): Gemini3ThinkingLevel {
  const isFlashModel = modelId.toLowerCase().includes("flash");

  switch (effort) {
    case "low":
      return "low";
    case "medium":
      // Flash supports medium, Pro falls back to low
      return isFlashModel ? "medium" : "low";
    case "high":
      return "high";
    default:
      return "high"; // Default to high for Gemini 3
  }
}

export function getProviderReasoningOptions(
  provider: string,
  reasoningConfig?: ReasoningConfig,
  modelId?: string
): ProviderStreamOptions {
  switch (provider) {
    case "openai":
      return {
        openai: {
          reasoning: true,
        },
      };

    case "google": {
      // Gemini 3 uses thinkingLevel (categorical), Gemini 2.5 uses thinkingBudget (token count)
      if (modelId && isGemini3Model(modelId)) {
        const thinkingLevel = getGemini3ThinkingLevel(
          reasoningConfig?.effort ?? "high", // Gemini 3 defaults to high
          modelId
        );

        return {
          providerOptions: {
            google: {
              structuredOutputs: false,
              thinkingConfig: {
                thinkingLevel,
                // Gemini 3 properly supports includeThoughts via @ai-sdk/google
                includeThoughts: true,
              },
            },
          },
        };
      }

      // Gemini 2.5 and earlier: use thinkingBudget
      const thinkingBudget =
        reasoningConfig?.maxTokens ??
        GOOGLE_THINKING_BUDGET_MAP[reasoningConfig?.effort ?? "medium"];

      return {
        providerOptions: {
          google: {
            // Explicitly disable structured outputs - AI SDK defaults to true
            // which causes some Gemini models to output JSON instead of prose
            structuredOutputs: false,
            thinkingConfig: {
              thinkingBudget,
              // Include thought summaries in response - @ai-sdk/google v2.0.51+
              // now properly supports this for Gemini 2.5 models
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
            reasoningEffort: (() => {
              if (effort === "low") {
                return "low";
              }
              if (effort === "high") {
                return "high";
              }
              return "default";
            })(),
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
      // IMPORTANT: Only one of effort/max_tokens can be specified per request.
      // Must use providerOptions.openrouter (not extraBody) at the streamText level
      const reasoningOptions: OpenRouterReasoningOptions = {
        exclude: false,
      };

      // effort and max_tokens are mutually exclusive on OpenRouter.
      // Prefer effort when set; fall back to max_tokens only when effort is absent.
      if (reasoningConfig?.effort) {
        reasoningOptions.effort = reasoningConfig.effort;
      } else if (reasoningConfig?.maxTokens) {
        reasoningOptions["max_tokens"] = reasoningConfig.maxTokens;
      }

      // Enable reasoning with provided config or use enabled: true for defaults
      const hasExplicitConfig =
        reasoningOptions.effort !== undefined ||
        reasoningOptions["max_tokens"] !== undefined;
      if (!hasExplicitConfig) {
        reasoningOptions.enabled = true;
      }

      return {
        providerOptions: {
          openrouter: {
            reasoning: reasoningOptions,
          },
        },
      };
    }

    case "moonshot":
      // Moonshot uses OpenAI-compatible API format
      // Kimi K2 Thinking has mandatory reasoning that is always enabled
      return {
        openai: {
          reasoning: true,
        },
      };

    default:
      return {};
  }
}

/**
 * Get provider options for when a reasoning-capable model has reasoning disabled.
 * Some providers (e.g., OpenRouter) auto-enable reasoning for capable models,
 * so we need to explicitly disable it. Other providers only reason when
 * explicitly asked, so base options suffice.
 */
export function getReasoningDisabledOptions(
  provider: string
): ProviderStreamOptions {
  if (provider === "openrouter") {
    return {
      providerOptions: {
        openrouter: {
          reasoning: {
            enabled: false,
          },
        },
      },
    };
  }
  return getProviderBaseOptions(provider);
}

/**
 * Get baseline provider options that should always be applied.
 * Currently only Google requires this to explicitly disable structured outputs.
 */
export function getProviderBaseOptions(
  provider: string
): ProviderStreamOptions {
  if (provider === "google") {
    return {
      providerOptions: {
        google: {
          // Explicitly disable structured outputs - AI SDK defaults to true
          // which causes some Gemini models to output JSON instead of prose
          structuredOutputs: false,
        },
      },
    };
  }
  return {};
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
