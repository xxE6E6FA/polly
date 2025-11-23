import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { CheckCircle } from "@phosphor-icons/react";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { useQuery } from "convex/react";
import { memo, useCallback, useMemo } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";

// Union type for models returned by getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

// Memoized model item component
const ModelItemComponent = ({
  model,
  onSelect,
  hasReachedPollyLimit,
  isSelected,
}: {
  model: AvailableModel;
  onSelect: (value: string) => void;
  hasReachedPollyLimit?: boolean;
  isSelected?: boolean;
}) => {
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

  // Convert model to capabilities format
  const modelForCapabilities = useMemo(
    () => ({
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

  const _capabilities = useMemo(
    () => getModelCapabilities(modelForCapabilities),
    [modelForCapabilities]
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isUnavailable || (model.free && hasReachedPollyLimit)) {
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(model.modelId);
      }
    },
    [model.modelId, model.free, hasReachedPollyLimit, onSelect, isUnavailable]
  );

  const isPollyDisabled = model.free && hasReachedPollyLimit;
  const isDisabled = isUnavailable || isPollyDisabled;

  // Helper to format context length
  const formatContext = (length?: number) => {
    if (!length) {
      return null;
    }
    if (length >= 1000) {
      return `${Math.round(length / 1000)}K`;
    }
    return length.toString();
  };

  const modelItem = (
    <div
      key={model.modelId}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      className={cn(
        "cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-muted/50 border-b border-border/40 last:border-0",
        isDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        isSelected && "bg-muted/50"
      )}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground border border-border/50">
            <ProviderIcon provider={model.provider} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate leading-none mb-1.5 mt-0.5">
              {model.name}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {/* Context Window Tag */}
              {model.contextLength && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                >
                  {formatContext(model.contextLength)}
                </Badge>
              )}

              {/* Privacy Tag */}
              {model.modelId.includes("private") && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                >
                  Private
                </Badge>
              )}

              {/* Default Tag (if applicable, logic needed) */}
              {/* {isDefault && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                >
                  Default
                </Badge>
              )} */}

              {/* Capability Tags */}
              {model.supportsReasoning && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                >
                  Reasoning
                </Badge>
              )}

              {model.supportsImages && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                >
                  Vision
                </Badge>
              )}

              {/* Status Badges */}
              {model.free && !isPollyDisabled && (
                <Badge
                  className="h-5 shrink-0 border-success-border bg-success-bg px-1.5 py-0 text-[10px] text-success font-normal"
                  variant="secondary"
                >
                  Free
                </Badge>
              )}
              {isPollyDisabled && (
                <Badge
                  className="h-5 shrink-0 border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400 font-normal"
                  variant="secondary"
                >
                  Limit Reached
                </Badge>
              )}
              {isUnavailable && (
                <Badge
                  className="h-5 shrink-0 border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300 font-normal"
                  variant="secondary"
                >
                  Unavailable
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isSelected && (
          <div className="flex shrink-0 items-center justify-center h-10 w-6">
            <CheckCircle
              className="h-5 w-5 fill-primary text-primary-foreground"
              weight="fill"
            />
          </div>
        )}
      </div>
    </div>
  );

  if (isPollyDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger>{modelItem}</TooltipTrigger>
        <TooltipContent>
          <div>
            <div className="font-semibold text-foreground">
              Monthly Limit Reached
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              You've used all {MONTHLY_MESSAGE_LIMIT} free messages this month.
              Switch to BYOK models for unlimited usage.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isUnavailable) {
    return (
      <Tooltip>
        <TooltipTrigger>{modelItem}</TooltipTrigger>
        <TooltipContent>
          <div>
            <div className="font-semibold text-foreground">
              Model No Longer Available
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This model has been disabled or deprecated by its provider. Please
              remove it from Settings or select a different model.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return modelItem;
};

ModelItemComponent.displayName = "ModelItem";

export const ModelItem = memo(ModelItemComponent);
