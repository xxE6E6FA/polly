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
import {
  getProviderReasoningConfig,
  type ReasoningConfig,
  type ProviderStreamOptions,
} from "../../shared/reasoning-config";
import type { ProviderType } from "../types";

// ── Module-level LanguageModel cache ─────────────────────────────────
// Non-OpenRouter providers are stateless (provider + model + apiKey → instance),
// so we can safely cache them. OpenRouter is excluded because it queries user
// settings (sorting preference) which can change between calls.
const LM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LM_CACHE_MAX_ENTRIES = 50;
const languageModelCache = new Map<
  string,
  { model: LanguageModel; expiresAt: number }
>();

function getCachedLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string,
): LanguageModel | undefined {
  const cacheKey = `${provider}_${modelId}_${apiKey.slice(0, 8)}`;
  const entry = languageModelCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    languageModelCache.delete(cacheKey);
    return undefined;
  }
  return entry.model;
}

function setCachedLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string,
  model: LanguageModel,
): void {
  if (languageModelCache.size >= LM_CACHE_MAX_ENTRIES) {
    const firstKey = languageModelCache.keys().next().value;
    if (firstKey) languageModelCache.delete(firstKey);
  }
  const cacheKey = `${provider}_${modelId}_${apiKey.slice(0, 8)}`;
  languageModelCache.set(cacheKey, {
    model,
    expiresAt: Date.now() + LM_CACHE_TTL_MS,
  });
}

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

  openrouter: (
    apiKey: string,
    model: string,
    sorting?: string,
  ) => {
    try {
      const openrouterProvider = createOpenRouter({
        apiKey,
        headers: {
          "HTTP-Referer": "https://pollyai.chat",
          "X-Title": "Polly Chat",
        },
      });

      // Map sorting preference to native provider.sort option
      const sortMap: Record<string, "price" | "throughput" | "latency" | undefined> = {
        price: "price",
        throughput: "throughput",
        latency: "latency",
      };

      return openrouterProvider.chat(model, {
        provider: sorting && sorting !== "default" ? { sort: sortMap[sorting] } : undefined,
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
  _ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  apiKey: string,
  _userId?: Id<"users">,
  openRouterSorting?: string,
): Promise<LanguageModel> => {
  // OpenRouter: now cacheable since sorting is resolved externally
  if (provider === "openrouter") {
    const orCacheKey = `openrouter_${model}_${apiKey.slice(0, 8)}_${openRouterSorting || "default"}`;
    const orEntry = languageModelCache.get(orCacheKey);
    if (orEntry && Date.now() <= orEntry.expiresAt) {
      return orEntry.model;
    }
    const lm = createProviderModel.openrouter(apiKey, model, openRouterSorting);
    if (languageModelCache.size >= LM_CACHE_MAX_ENTRIES) {
      const firstKey = languageModelCache.keys().next().value;
      if (firstKey) languageModelCache.delete(firstKey);
    }
    languageModelCache.set(orCacheKey, {
      model: lm,
      expiresAt: Date.now() + LM_CACHE_TTL_MS,
    });
    return lm;
  }

  // Check module-level cache for non-OpenRouter providers
  const cached = getCachedLanguageModel(provider, model, apiKey);
  if (cached) return cached;

  let lm: LanguageModel;
  switch (provider) {
    case "openai":
      lm = createProviderModel.openai(apiKey, model);
      break;
    case "anthropic":
      lm = createProviderModel.anthropic(apiKey, model);
      break;
    case "google":
      lm = createProviderModel.google(apiKey, model);
      break;
    case "groq":
      lm = createProviderModel.groq(apiKey, model);
      break;
    case "moonshot":
      lm = createProviderModel.moonshot(apiKey, model);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  setCachedLanguageModel(provider, model, apiKey, lm);
  return lm;
};

export const getProviderStreamOptions = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  reasoningConfig?: ReasoningConfig,
  modelObject?: {
    modelId: string;
    provider: string;
    supportsReasoning: boolean;
    supportsTemperature?: boolean;
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
    supportsTemperature?: boolean;
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
      supportsTemperature: modelObject.supportsTemperature,
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

  // Fallback: resolve capabilities from models.dev cache
  if (!modelWithCapabilities.supportsReasoning) {
    try {
      const capabilities = await ctx.runQuery(
        api.capabilities.resolveCapabilities,
        { provider: actualProvider, modelId: model }
      );
      modelWithCapabilities.supportsReasoning = capabilities.supportsReasoning;
      modelWithCapabilities.supportsTemperature = capabilities.supportsTemperature;
    } catch {
      // models.dev lookup failed — leave as false
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
