import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";

import { type ProviderType } from "./types";
import { applyOpenRouterSorting } from "./utils";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getCapabilityFromPatterns } from "../lib/model_capabilities_config";

// Provider factory map
const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) =>
    createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string, enableWebSearch?: boolean) =>
    createGoogleGenerativeAI({ apiKey })(model, {
      ...(enableWebSearch && { useSearchGrounding: true }),
    }),

  openrouter: async (
    apiKey: string,
    model: string,
    ctx: ActionCtx,
    userId?: Id<"users">,
    enableWebSearch?: boolean
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

    // Apply OpenRouter sorting shortcuts and web search
    let modifiedModel = applyOpenRouterSorting(model, sorting);
    if (enableWebSearch) {
      modifiedModel = `${modifiedModel}:online`;
    }

    return openrouter.chat(modifiedModel);
  },
};

// Create language model based on provider
export const createLanguageModel = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  apiKey: string,
  userId?: Id<"users">,
  enableWebSearch?: boolean
): Promise<LanguageModel> => {
  if (provider === "openrouter") {
    return createProviderModel.openrouter(
      apiKey,
      model,
      ctx,
      userId,
      enableWebSearch
    );
  }

  if (provider === "google") {
    return createProviderModel.google(apiKey, model, enableWebSearch);
  }

  const factory = createProviderModel[provider];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return factory(apiKey, model);
};

// Check if model supports reasoning
export const isReasoningModel = (provider: string, model: string): boolean => {
  return getCapabilityFromPatterns("supportsReasoning", provider, model);
};
