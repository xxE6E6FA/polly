import type { Doc } from "@convex/_generated/dataModel";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { memo, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { CommandItem } from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";

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
    // Don't allow selecting Polly models if limit is reached
    if (model.free && hasReachedPollyLimit) {
      return;
    }
    onSelect(model.modelId);
  }, [model.modelId, model.free, hasReachedPollyLimit, onSelect]);

  // Check if this is a disabled Polly model
  const isPollyDisabled = model.free && hasReachedPollyLimit;

  const modelItem = (
    <CommandItem
      key={model.modelId}
      className={cn(
        "min-h-[44px] cursor-pointer px-4 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-accent/30 sm:min-h-0 sm:px-3 sm:py-2.5",
        isPollyDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
      )}
      value={`${model.name} ${model.provider} ${model.modelId}`}
      onSelect={handleSelect}
    >
      <div className="flex w-full items-center justify-between">
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
          <span className={cn("font-medium text-sm truncate")}>
            {model.name}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {capabilities.length > 0 &&
            capabilities.slice(0, 4).map((capability, index) => {
              const IconComponent = capability.icon;
              return (
                <Tooltip key={`${model.modelId}-${capability.label}-${index}`}>
                  <TooltipTrigger asChild>
                    <div className="flex h-6 w-6 cursor-help items-center justify-center rounded-md bg-muted/50 transition-all duration-200 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50">
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
        <TooltipTrigger asChild>{modelItem}</TooltipTrigger>
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

  return modelItem;
};

ModelItemComponent.displayName = "ModelItem";

export const ModelItem = memo(ModelItemComponent);
