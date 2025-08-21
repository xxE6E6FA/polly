/**
 * Centralized model resolution utilities to prevent duplication and bugs
 * across the codebase where model/provider selection logic is needed.
 */

import { api } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { log } from "./logger";

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
  log.debug("Model resolution called with:", { requestedModel, requestedProvider });
  
  // If both are provided, use them directly
  if (requestedModel && requestedProvider) {
    log.debug("Using provided values directly");
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
      const selectedModel = await ctx.runQuery(api.userModels.getUserSelectedModel);
      if (selectedModel) {
        finalModel = finalModel || selectedModel.modelId;
        finalProvider = finalProvider || selectedModel.provider;
      }
    } catch (error) {
      log.warn("Failed to get user's selected model:", error);
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
  
  log.debug("Model resolution final result:", result);
  return result;
}



/**
 * Get the effective model with full capabilities for internal actions
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
  free?: boolean;
}> {
  // Get user's selected model if not fully provided
  let finalModel = requestedModel;
  let finalProvider = requestedProvider;
  let fullModelObject: any = null;
  
  if (!finalModel || !finalProvider) {
    try {
      const selectedModel = await ctx.runQuery(api.userModels.getUserSelectedModel);
      if (selectedModel) {
        fullModelObject = selectedModel;
        finalModel = finalModel || selectedModel.modelId;
        finalProvider = finalProvider || selectedModel.provider;
      }
    } catch (error) {
      log.warn("Failed to get user's selected model:", error);
    }
  }

  // If we have specific model/provider but no full object, try to fetch it
  if ((finalModel && finalProvider) && !fullModelObject) {
    try {
      const modelFromDB = await ctx.runQuery(api.userModels.getModelByID, {
        modelId: finalModel,
        provider: finalProvider,
      });
      if (modelFromDB) {
        fullModelObject = modelFromDB;
      }
    } catch (error) {
      log.warn("Failed to get model by ID:", error);
    }
  }

  // Final fallback to defaults if still missing
  const modelId = finalModel || DEFAULT_BUILTIN_MODEL_ID;
  const provider = finalProvider || "google"; // Default to google provider

  // If we have the full model object, use it
  if (fullModelObject) {
    const result = {
      modelId: fullModelObject.modelId,
      provider: fullModelObject.provider,
      name: fullModelObject.name,
      supportsReasoning: fullModelObject.supportsReasoning || false,
      supportsImages: fullModelObject.supportsImages,
      supportsTools: fullModelObject.supportsTools,
      supportsFiles: fullModelObject.supportsFiles,
      contextLength: fullModelObject.contextLength,
      free: fullModelObject.free,
    };
    return result;
  }

  // Fallback for cases where we can't get the full model (anonymous users, etc.)
  const fallbackResult = {
    modelId,
    provider,
    name: modelId, // Use modelId as name fallback
    supportsReasoning: false, // Conservative default
    supportsImages: false,
    supportsTools: false,
    supportsFiles: false,
  };
  
  return fallbackResult;
}
