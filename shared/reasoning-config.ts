/**
 * Reasoning configuration — on/off toggle with fixed provider defaults.
 *
 * The model decides how much to think. We just tell it "think" or "don't think"
 * and send generous fixed defaults per provider where a budget is required.
 */

export type ReasoningConfig = {
  enabled?: boolean;
};

export type ModelWithCapabilities = {
  modelId: string;
  provider: string;
  supportsReasoning?: boolean;
  supportsTemperature?: boolean;
};

// Gemini 3 uses thinkingLevel (categorical), Gemini 2.5 uses thinkingBudget (token count)
type GoogleProviderOptions = {
  structuredOutputs?: boolean;
  thinkingConfig?: {
    thinkingBudget?: number;
    thinkingLevel?: "high";
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
          reasoningEffort: "default";
          parallelToolCalls: boolean;
        };
        openrouter?: {
          reasoning: {
            exclude?: boolean;
            enabled?: boolean;
          };
        };
      };
    };

// Fixed defaults — generous budgets, model decides how much to use
const ANTHROPIC_DEFAULT_BUDGET = 16384;
const GOOGLE_25_DEFAULT_BUDGET = 8192;

/**
 * Check if a model is a Gemini 3 model (uses thinkingLevel instead of thinkingBudget)
 */
export function isGemini3Model(modelId: string): boolean {
  const modelIdLower = modelId.toLowerCase();
  return (
    modelIdLower.includes("gemini-3-pro") ||
    modelIdLower.includes("gemini-3-flash")
  );
}

export function getProviderReasoningConfig(
  model: ModelWithCapabilities,
  reasoningConfig?: ReasoningConfig
): ProviderStreamOptions {
  const { provider, modelId, supportsReasoning, supportsTemperature } = model;

  // models.dev tells us everything: does the model reason? Is it mandatory?
  if (!supportsReasoning) {
    return getProviderBaseOptions(provider);
  }

  // Mandatory = supports reasoning but NOT temperature (o1, DeepSeek R1, etc.)
  const isMandatory = supportsTemperature === false;

  if (isMandatory) {
    return getProviderReasoningOptions(provider, modelId);
  }

  // Optional reasoning — only enable if explicitly requested
  if (!reasoningConfig?.enabled) {
    return getReasoningDisabledOptions(provider);
  }

  return getProviderReasoningOptions(provider, modelId);
}

export function getProviderReasoningOptions(
  provider: string,
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
        return {
          providerOptions: {
            google: {
              structuredOutputs: false,
              thinkingConfig: {
                thinkingLevel: "high",
                includeThoughts: true,
              },
            },
          },
        };
      }

      // Gemini 2.5 and earlier: use thinkingBudget
      return {
        providerOptions: {
          google: {
            structuredOutputs: false,
            thinkingConfig: {
              thinkingBudget: GOOGLE_25_DEFAULT_BUDGET,
              includeThoughts: true,
            },
          },
        },
      };
    }

    case "anthropic": {
      return {
        anthropic: {
          thinking: {
            type: "enabled",
            budgetTokens: ANTHROPIC_DEFAULT_BUDGET,
          },
        },
      };
    }

    case "groq": {
      return {
        providerOptions: {
          groq: {
            reasoningFormat: "parsed",
            reasoningEffort: "default",
            parallelToolCalls: true,
          },
        },
      };
    }

    case "openrouter": {
      return {
        providerOptions: {
          openrouter: {
            reasoning: {
              enabled: true,
            },
          },
        },
      };
    }

    case "moonshot":
      // Moonshot uses OpenAI-compatible API format
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
          structuredOutputs: false,
        },
      },
    };
  }
  return {};
}
