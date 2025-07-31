/**
 * Server-side AI streaming for regular conversations
 * Uses server-stored API keys with enhanced features like user preferences,
 * OpenRouter sorting, and database-backed model capabilities
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getProviderReasoningConfig } from "../../shared/reasoning-config";
import { log } from "../lib/logger";
import { type ProviderStreamOptions, type ProviderType } from "../types";
import { isReasoningModel } from "./reasoning_detection";
import { applyOpenRouterSorting } from "./server_utils";

// Enhanced provider factory with AI SDK optimizations
const createProviderModel = {
  openai: (apiKey: string, model: string) => {
    const openai = createOpenAI({ 
      apiKey,
      // Enable automatic prompt caching for eligible prompts (1024+ tokens)
      compatibility: "strict"
    });
    
    // Configure model-specific settings based on AI SDK best practices
    return openai.chat(model, {
      // Enable structured outputs for better JSON schema compatibility
      structuredOutputs: true,
      // Download images for multimodal support
      downloadImages: true,
    });
  },

  anthropic: (apiKey: string, model: string) => {
    const anthropic = createAnthropic({ 
      apiKey,
      // Cache control is enabled by default in v1
    });
    
    return anthropic.languageModel(model, {
      // Enable cache control for performance optimization
      cacheControl: true,
    });
  },

  google: (apiKey: string, model: string) => {
    const google = createGoogleGenerativeAI({ 
      apiKey,
      // Implicit caching is automatic for Gemini 2.5 models
    });
    
    return google.chat(model, {
      // Enable structured outputs
      structuredOutputs: true,
    });
  },

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
        log.warn(
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
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};

export const getProviderStreamOptions = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  reasoningConfig?: { effort?: "low" | "medium" | "high"; maxTokens?: number },
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
      log.warn("Failed to get user models for reasoning detection:", error);
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
