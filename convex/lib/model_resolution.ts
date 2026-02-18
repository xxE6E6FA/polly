/**
 * Centralized model resolution utilities to prevent duplication and bugs
 * across the codebase where model/provider selection logic is needed.
 */

import { api } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUserId } from "./auth";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { resolveModelCapabilities } from "./capability_resolver";

export interface EffectiveModel {
  modelId: string;
  provider: string;
}

/**
 * Get the effective model for a user, handling fallbacks properly.
 * This centralizes the logic that was duplicated across sendMessage, createConversation, etc.
 * 
 * @param ctx - Convex context (Query, Mutation, or Action)
 * @param requestedModel - Model from the request (optional)
 * @param requestedProvider - Provider from the request (optional)
 * @returns The effective model and provider to use
 */
export async function getUserEffectiveModel(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  requestedModel?: string,
  requestedProvider?: string
): Promise<EffectiveModel> {
  
  // If both are provided, use them directly
  if (requestedModel && requestedProvider) {
    return {
      modelId: requestedModel,
      provider: requestedProvider,
    };
  }

  // Get user's selected model if not fully provided
  let finalModel = requestedModel;
  let finalProvider = requestedProvider;
  
  if (!finalModel || !finalProvider) {
    try {
      if ("db" in ctx) {
        // Direct DB query preserves auth in mutation/query context
        const userId = await getAuthUserId(ctx);
        if (userId) {
          const selectedModel = await ctx.db
            .query("userModels")
            .withIndex("by_user", q => q.eq("userId", userId))
            .filter(q => q.eq(q.field("selected"), true))
            .unique();
          if (selectedModel) {
            finalModel = finalModel || selectedModel.modelId;
            finalProvider = finalProvider || selectedModel.provider;
          }
        }
      } else {
        const selectedModel = await ctx.runQuery(api.userModels.getUserSelectedModel);
        if (selectedModel) {
          finalModel = finalModel || selectedModel.modelId;
          finalProvider = finalProvider || selectedModel.provider;
        }
      }
    } catch (error) {
      console.warn("Failed to get user's selected model:", error);
      // Continue to fallback logic below
    }
  }

  // Final fallback to defaults if still missing
  const modelId = finalModel || DEFAULT_BUILTIN_MODEL_ID;
  const provider = finalProvider || "google"; // Default to google provider
  
  const result = {
    modelId,
    provider,
  };
  
  return result;
}



/**
 * Get the effective model with full capabilities for internal actions.
 *
 * IMPORTANT: Capabilities are now resolved dynamically from models.dev cache,
 * NOT from stored model data. Unknown models get conservative defaults.
 */
export async function getUserEffectiveModelWithCapabilities(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  requestedModel?: string,
  requestedProvider?: string
): Promise<{
  modelId: string;
  provider: string;
  name: string;
  supportsReasoning: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities?: string[];
  free?: boolean;
}> {
  // Get user's selected model if not fully provided
  let finalModel = requestedModel;
  let finalProvider = requestedProvider;
  let modelName: string | null = null;
  let isFree: boolean | undefined = undefined;

  if (!finalModel || !finalProvider) {
    try {
      if ("db" in ctx) {
        const userId = await getAuthUserId(ctx);
        if (userId) {
          const selectedModel = await ctx.db
            .query("userModels")
            .withIndex("by_user", q => q.eq("userId", userId))
            .filter(q => q.eq(q.field("selected"), true))
            .unique();
          if (selectedModel) {
            finalModel = finalModel || selectedModel.modelId;
            finalProvider = finalProvider || selectedModel.provider;
            modelName = selectedModel.name;
            isFree = selectedModel.free;
          }
        }
      } else {
        const selectedModel = await ctx.runQuery(api.userModels.getUserSelectedModel);
        if (selectedModel) {
          finalModel = finalModel || selectedModel.modelId;
          finalProvider = finalProvider || selectedModel.provider;
          modelName = selectedModel.name;
          isFree = "free" in selectedModel ? selectedModel.free : undefined;
        }
      }
    } catch (error) {
      console.warn("Failed to get user's selected model:", error);
    }
  }

  // If we have specific model/provider but no name, try to fetch it
  if ((finalModel && finalProvider) && !modelName) {
    try {
      if ("db" in ctx) {
        // Try user model first
        const userId = await getAuthUserId(ctx);
        if (userId) {
          const userModel = await ctx.db
            .query("userModels")
            .withIndex("by_user", q => q.eq("userId", userId))
            .filter(q =>
              q.and(
                q.eq(q.field("modelId"), finalModel!),
                q.eq(q.field("provider"), finalProvider!)
              )
            )
            .unique();
          if (userModel) {
            modelName = userModel.name;
            isFree = userModel.free;
          }
        }
        if (!modelName) {
          const builtInModel = await ctx.db
            .query("builtInModels")
            .filter(q =>
              q.and(
                q.eq(q.field("modelId"), finalModel!),
                q.eq(q.field("provider"), finalProvider!),
                q.eq(q.field("isActive"), true)
              )
            )
            .unique();
          if (builtInModel) {
            modelName = builtInModel.name;
            isFree = builtInModel.free;
          }
        }
      } else {
        const modelFromDB = await ctx.runQuery(api.userModels.getModelByID, {
          modelId: finalModel,
          provider: finalProvider,
        });
        if (modelFromDB) {
          modelName = modelFromDB.name;
          isFree = "free" in modelFromDB ? modelFromDB.free : undefined;
        }
      }
    } catch (error) {
      console.warn("Failed to get model by ID:", error);
    }
  }

  // Final fallback to defaults if still missing
  const modelId = finalModel || DEFAULT_BUILTIN_MODEL_ID;
  const provider = finalProvider || "google"; // Default to google provider

  // Resolve capabilities dynamically from models.dev cache
  // We no longer use stored capabilities from userModels/builtInModels
  if ("db" in ctx) {
    // For Query/Mutation context, resolve capabilities directly
    const capabilities = await resolveModelCapabilities(ctx, provider, modelId);

    return {
      modelId,
      provider,
      name: modelName || modelId,
      supportsReasoning: capabilities.supportsReasoning,
      supportsImages: capabilities.supportsImages,
      supportsTools: capabilities.supportsTools,
      supportsFiles: capabilities.supportsFiles,
      contextLength: capabilities.contextLength,
      maxOutputTokens: capabilities.maxOutputTokens,
      inputModalities: capabilities.inputModalities,
      free: isFree,
    };
  }

  // For ActionCtx, we need to run a query to resolve capabilities
  const capabilities = await ctx.runQuery(api.capabilities.resolveCapabilities, {
    provider,
    modelId,
  });

  return {
    modelId,
    provider,
    name: modelName || modelId,
    supportsReasoning: capabilities.supportsReasoning,
    supportsImages: capabilities.supportsImages,
    supportsTools: capabilities.supportsTools,
    supportsFiles: capabilities.supportsFiles,
    contextLength: capabilities.contextLength,
    maxOutputTokens: capabilities.maxOutputTokens,
    inputModalities: capabilities.inputModalities,
    free: isFree,
  };
}
