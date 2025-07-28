/**
 * Shared model selection logic with local storage caching
 */
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { isUserModel } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ModelForCapabilities } from "@/types";

// Union type for models returned by getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

export function useModelSelection() {
  const { user } = useUserDataContext();

  // Get user's selected model
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = useMemo(
    () => selectedModelRaw ?? get(CACHE_KEYS.selectedModel, null),
    [selectedModelRaw]
  );

  // Cache selected model to localStorage
  useEffect(() => {
    if (selectedModelRaw) {
      set(CACHE_KEYS.selectedModel, selectedModelRaw);
    }
  }, [selectedModelRaw]);

  // Get all user models
  const userModelsRaw = useQuery(
    api.userModels.getAvailableModels,
    user?._id ? {} : "skip"
  );

  const userModels = useMemo(
    () => userModelsRaw ?? get(CACHE_KEYS.userModels, []),
    [userModelsRaw]
  );

  // Cache user models to localStorage
  useEffect(() => {
    if (
      userModelsRaw &&
      Array.isArray(userModelsRaw) &&
      userModelsRaw.length > 0
    ) {
      set(CACHE_KEYS.userModels, userModelsRaw);
    }
  }, [userModelsRaw]);

  // Group models: separate free models from provider-grouped models
  const modelGroups = useMemo(() => {
    const freeModels: AvailableModel[] = [];
    const providerModels: Record<string, AvailableModel[]> = {};

    userModels.forEach((model: AvailableModel | null) => {
      if (!model) {
        return;
      }

      if (model.free) {
        freeModels.push(model);
      } else {
        if (!providerModels[model.provider]) {
          providerModels[model.provider] = [];
        }
        providerModels[model.provider].push(model);
      }
    });

    return {
      freeModels,
      providerModels: Object.keys(providerModels)
        .sort()
        .reduce(
          (sorted, provider) => {
            sorted[provider] = providerModels[provider];
            return sorted;
          },
          {} as Record<string, AvailableModel[]>
        ),
    };
  }, [userModels]);

  // Model capabilities for private mode
  const modelCapabilities: ModelForCapabilities | null = useMemo(() => {
    if (!(selectedModel && isUserModel(selectedModel))) {
      return null;
    }
    return {
      ...selectedModel,
      modelId: selectedModel.modelId,
      provider: selectedModel.provider,
      name: selectedModel.name,
      contextLength: selectedModel.contextLength,
      supportsReasoning: selectedModel.supportsReasoning,
      supportsImages: selectedModel.supportsImages,
      supportsTools: selectedModel.supportsTools,
      supportsFiles: selectedModel.supportsFiles,
    };
  }, [selectedModel]);

  return {
    selectedModel,
    userModels,
    modelGroups,
    modelCapabilities,
    isModelLoaded: !!selectedModel,
  };
}
