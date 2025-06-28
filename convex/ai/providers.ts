import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";

import { type ProviderType, type ProviderStreamOptions } from "./types";
import { applyOpenRouterSorting } from "./utils";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getCapabilityFromPatterns } from "../lib/model_capabilities_config";
import { isReasoningModelEnhanced } from "./reasoning_detection";
import { getProviderReasoningConfig } from "../lib/provider_reasoning_config";

// Provider factory map
const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) =>
    createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string) =>
    createGoogleGenerativeAI({ apiKey })(model),

  openrouter: async (
    apiKey: string,
    model: string,
    ctx: ActionCtx,
    userId?: Id<"users">
  ) => {
    const openrouter = createOpenRouter({ apiKey });

    // Get user's OpenRouter sorting preference
    let sorting: "default" | "price" | "throughput" | "latency" = "default";
    if (userId) {
      try {
        const userSettings = await ctx.runQuery(
          api.userSettings.getUserSettings,
          { userId }
        );
        sorting = userSettings?.openRouterSorting ?? "default";
      } catch (error) {
        console.warn(
          "Failed to get user settings for OpenRouter sorting:",
          error
        );
      }
    }

    // Apply OpenRouter sorting shortcuts
    const modifiedModel = applyOpenRouterSorting(model, sorting);

    return openrouter.chat(modifiedModel);
  },
};

// Create language model based on provider
export const createLanguageModel = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  apiKey: string,
  userId?: Id<"users">
): Promise<LanguageModel> => {
  if (provider === "openrouter") {
    return createProviderModel.openrouter(apiKey, model, ctx, userId);
  }

  if (provider === "google") {
    return createProviderModel.google(apiKey, model);
  }

  const factory = createProviderModel[provider];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return factory(apiKey, model);
};

export const getProviderStreamOptions = async (
  provider: ProviderType,
  model: string,
  reasoningConfig?: { effort?: "low" | "medium" | "high"; maxTokens?: number }
): Promise<ProviderStreamOptions> => {
  // Check reasoning support with enhanced detection
  const supportsReasoning = await isReasoningModelEnhanced(provider, model);

  if (!supportsReasoning) {
    return {};
  }

  // OpenAI reasoning configuration
  if (provider === "openai") {
    return {
      openai: {
        reasoning: true,
      },
    };
  }

  // Use shared reasoning configuration to ensure consistency
  // with client-side streaming for all providers
  return getProviderReasoningConfig(provider, model, reasoningConfig);
};

export const isReasoningModel = (provider: string, model: string): boolean => {
  return getCapabilityFromPatterns("supportsReasoning", provider, model);
};
