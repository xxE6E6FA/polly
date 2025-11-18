import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { useQuery } from "convex/react";
import { memo, useCallback, useMemo } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { CommandItem } from "@/components/ui/command";
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
}: {
  model: AvailableModel;
  onSelect: (value: string) => void;
  hasReachedPollyLimit?: boolean;
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

  const capabilities = useMemo(
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

  const isPollyDisabled = model.free && hasReachedPollyLimit;
  const isDisabled = isUnavailable || isPollyDisabled;

  const modelItem = (
    <CommandItem
      key={model.modelId}
      className={cn(
        "cursor-pointer rounded-none px-3 py-2.5 text-xs transition-colors hover:bg-muted",
        isDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
      )}
      value={`${model.name} ${model.provider} ${model.modelId}`}
      onSelect={handleSelect}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground">
            <ProviderIcon provider={model.provider} className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {model.free && !isPollyDisabled && (
              <Badge
                className="h-5 shrink-0 border-success-border bg-success-bg px-1.5 py-0 text-[10px] text-success"
                variant="secondary"
              >
                Free
              </Badge>
            )}
            {isPollyDisabled && (
              <Badge
                className="h-5 shrink-0 border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400"
                variant="secondary"
              >
                Limit Reached
              </Badge>
            )}
            {isUnavailable && (
              <Badge
                className="h-5 shrink-0 border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                variant="secondary"
              >
                Unavailable
              </Badge>
            )}
            <span className={cn("font-medium text-xs truncate")}>
              {model.name}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {capabilities.length > 0 &&
            capabilities.slice(0, 4).map((capability, index) => {
              const IconComponent = capability.icon;
              return (
                <Tooltip key={`${model.modelId}-${capability.label}-${index}`}>
                  <TooltipTrigger>
                    <div className="flex h-6 w-6 cursor-help items-center justify-center rounded-md bg-muted/70 transition-all duration-200 hover:bg-muted/90 dark:bg-muted/50 dark:hover:bg-muted/70">
                      <IconComponent className="h-3.5 w-3.5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div>
                      <div className="font-semibold text-foreground">
                        {capability.label}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {capability.description}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
        </div>
      </div>
    </CommandItem>
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
