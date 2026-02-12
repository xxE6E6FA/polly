import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { formatContextLength } from "@/lib/format-context";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { useUserDataContext } from "@/providers/user-data-context";
import type { HydratedModel } from "@/types";

/**
 * Shared data computation for model picker items (desktop + mobile).
 *
 * Encapsulates: unavailability check, capabilities, disabled state,
 * context-length display, and the guarded select handler.
 */
export function useModelItemData(
  model: HydratedModel,
  onSelect: (value: string) => void,
  hasReachedPollyLimit?: boolean
) {
  const { user } = useUserDataContext();
  const unavailableModels = useQuery(
    api.userModels.getUnavailableModelIds,
    user?._id ? {} : "skip"
  );

  const isUnavailable = useMemo(() => {
    if (!unavailableModels || model.free) {
      return false;
    }
    return unavailableModels.some(
      u => u.modelId === model.modelId && u.provider === model.provider
    );
  }, [unavailableModels, model]);

  const capabilities = useMemo(
    () =>
      getModelCapabilities({
        modelId: model.modelId,
        provider: model.provider,
        name: model.name,
        contextLength: model.contextLength,
        supportsReasoning: model.supportsReasoning,
        supportsImages: model.supportsImages,
        supportsTools: model.supportsTools,
        supportsFiles: model.supportsFiles,
        inputModalities: model.inputModalities,
      }),
    [model]
  );

  const handleSelect = useCallback(() => {
    if (isUnavailable) {
      return;
    }
    if (model.free && hasReachedPollyLimit) {
      return;
    }
    onSelect(model.modelId);
  }, [
    model.modelId,
    model.free,
    hasReachedPollyLimit,
    onSelect,
    isUnavailable,
  ]);

  const isPollyDisabled = model.free && hasReachedPollyLimit;
  const isDisabled = isUnavailable || isPollyDisabled;
  const contextDisplay = formatContextLength(model.contextLength);

  return {
    isUnavailable,
    capabilities,
    handleSelect,
    isPollyDisabled,
    isDisabled,
    contextDisplay,
  };
}
