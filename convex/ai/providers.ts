import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";
import { DEFAULT_POLLY_MODEL_ID, mapPollyModelToProvider } from "@shared/constants";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getProviderReasoningConfig } from "../../shared/reasoning-config";
import { type ProviderStreamOptions, type ProviderType } from "../types";
import { isReasoningModelEnhanced } from "./reasoning_detection";
import { applyOpenRouterSorting } from "./utils";

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
          api.userSettings.getUserSettings
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
  provider: ProviderType | "polly",
  model: string,
  apiKey: string,
  userId?: Id<"users">
): Promise<LanguageModel> => {
  // Handle Polly provider mapping
  if (provider === "polly") {
    const actualProvider = mapPollyModelToProvider(model) as ProviderType;
    return createLanguageModel(ctx, actualProvider, model, apiKey, userId);
  }

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
  ctx: ActionCtx,
  provider: ProviderType | "polly",
  model: string,
  reasoningConfig?: { effort?: "low" | "medium" | "high"; maxTokens?: number },
  userId?: Id<"users">
): Promise<ProviderStreamOptions> => {
  // Handle Polly provider mapping for reasoning config
  let actualProvider = provider;
  if (provider === "polly") {
    actualProvider = mapPollyModelToProvider(model) as ProviderType;
  }

  // Get model capabilities from database (the source of truth)
  let modelWithCapabilities: {
    modelId: string;
    provider: string;
    supportsReasoning?: boolean;
  } = {
    modelId: model,
    provider: actualProvider,
    supportsReasoning: false,
  };

  if (userId) {
    // Look up the model in user's configured models (preferred source)
    try {
      const userModel = await ctx.runQuery(api.userModels.getModelByID, {
        modelId: model,
        provider: actualProvider,
      });

      if (userModel) {
        modelWithCapabilities = {
          modelId: userModel.modelId,
          provider: userModel.provider,
          supportsReasoning: userModel.supportsReasoning,
        };
      }
    } catch (error) {
      console.warn("Failed to get user models for reasoning detection:", error);
    }
  }

  // Fallback for anonymous users or models not in user's list
  if (!modelWithCapabilities.supportsReasoning) {
    // Check if it's the anonymous default model (gemini-2.5-flash-lite-preview-06-17)
    if (
      model === DEFAULT_POLLY_MODEL_ID &&
      process.env.GEMINI_API_KEY
    ) {
      modelWithCapabilities.supportsReasoning = true;
    } else {
      // Final fallback to enhanced detection for edge cases
      modelWithCapabilities.supportsReasoning = await isReasoningModelEnhanced(actualProvider, model);
    }
  }

  // Use shared reasoning configuration logic
  return getProviderReasoningConfig(modelWithCapabilities, reasoningConfig);
};


