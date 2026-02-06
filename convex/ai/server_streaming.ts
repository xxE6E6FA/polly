/**
 * Server-side AI streaming for regular conversations
 * Uses server-stored API keys with enhanced features like user preferences,
 * OpenRouter sorting, and database-backed model capabilities
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { getProviderReasoningConfig } from "../../shared/reasoning-config";
import type { ProviderStreamOptions, ProviderType } from "../types";
import { isReasoningModel } from "./reasoning_detection";

// Enhanced provider factory with AI SDK optimizations
const createProviderModel = {
  openai: (apiKey: string, model: string) => {
    const openai = createOpenAI({ 
      apiKey,
    });
    
    // In v5, model options are passed via providerOptions in streamText, not here
    return openai.chat(model);
  },

  anthropic: (apiKey: string, model: string) => {
    const anthropic = createAnthropic({ 
      apiKey,
    });
    
    // In v5, model options are passed via providerOptions in streamText, not here
    return anthropic.languageModel(model);
  },

  google: (apiKey: string, model: string) => {
    const google = createGoogleGenerativeAI({ 
      apiKey,
    });
    
    // In v5, model options are passed via providerOptions in streamText, not here
    return google.chat(model);
  },

  groq: (apiKey: string, model: string) => {
    const groq = createGroq({ apiKey });
    return groq(model);
  },

  moonshot: (apiKey: string, model: string) => {
    const moonshot = createOpenAICompatible({
      name: "moonshot",
      apiKey,
      baseURL: "https://api.moonshot.ai/v1",
    });
    return moonshot.chatModel(model);
  },

  openrouter: async (
    apiKey: string,
    model: string,
    ctx: ActionCtx,
    userId?: Id<"users">
  ) => {
    try {
      const openrouterProvider = createOpenRouter({
        apiKey,
        headers: {
          "HTTP-Referer": "https://pollyai.chat",
          "X-Title": "Polly Chat",
        },
      });

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

      // Map sorting preference to native provider.sort option
      const sortMap: Record<string, "price" | "throughput" | "latency" | undefined> = {
        price: "price",
        throughput: "throughput",
        latency: "latency",
      };

      return openrouterProvider.chat(model, {
        provider: sorting !== "default" ? { sort: sortMap[sorting] } : undefined,
      });
    } catch (error) {
      console.error("[server_streaming] Error creating OpenRouter model:", {
        error,
        model,
        apiKeyLength: apiKey.length,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
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
  // No more provider mapping needed - provider is already the actual provider

  // Handle OpenRouter separately due to async requirements
  if (provider === "openrouter") {
    return await createProviderModel.openrouter(apiKey, model, ctx, userId);
  }

  // Handle other providers synchronously
  switch (provider) {
    case "openai":
      return createProviderModel.openai(apiKey, model);
    case "anthropic":
      return createProviderModel.anthropic(apiKey, model);
    case "google":
      return createProviderModel.google(apiKey, model);
    case "groq":
      return createProviderModel.groq(apiKey, model);
    case "moonshot":
      return createProviderModel.moonshot(apiKey, model);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};

export const getProviderStreamOptions = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  reasoningConfig?: { effort?: "low" | "medium" | "high"; maxOutputTokens?: number },
  modelObject?: { 
    modelId: string; 
    provider: string; 
    supportsReasoning: boolean;
    builtIn?: boolean;
    [key: string]: any; // Allow other model properties
  }
): Promise<ProviderStreamOptions> => {
  // Provider is already the actual provider - no mapping needed
  const actualProvider = provider;

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

  if (modelObject) {
    // Use the provided modelObject directly
    modelWithCapabilities = {
      modelId: modelObject.modelId,
      provider: modelObject.provider,
      supportsReasoning: modelObject.supportsReasoning,
    };
  } else {
    // Fallback to user-specific model lookup if modelObject is not provided
    try {
      const userModel = await ctx.runQuery(api.userModels.getModelByID, {
        modelId: model,
        provider: actualProvider,
      });

      if (userModel) {
        // Found user model
        modelWithCapabilities = {
          modelId: userModel.modelId,
          provider: userModel.provider,
          supportsReasoning: userModel.supportsReasoning,
        };
      } else {
        // No user model found - using default
      }
    } catch (error) {
      console.warn("Failed to get user models for reasoning detection:", error);
    }
  }

  // Fallback for anonymous users or models not in user's list
  if (!modelWithCapabilities.supportsReasoning) {
    // For built-in models, check if we have the model in the database
    if (modelObject?.builtIn) {
      const builtInModels = await ctx.runQuery(api.userModels.getBuiltInModels);
      const foundModel = builtInModels.find((m: any) => m.modelId === model && m.provider === provider);
      if (foundModel) {
        modelWithCapabilities.supportsReasoning = foundModel.supportsReasoning;
      }
    } else {
      // Final fallback to enhanced detection for edge cases
      modelWithCapabilities.supportsReasoning = await isReasoningModel(
        actualProvider,
        model
      );
    }
  }

  // Use shared reasoning configuration logic
  const sharedStreamOptions = getProviderReasoningConfig(
    modelWithCapabilities,
    reasoningConfig
  );
  
  // Convert shared type to local type (they should be compatible)
  return sharedStreamOptions as ProviderStreamOptions;
};
