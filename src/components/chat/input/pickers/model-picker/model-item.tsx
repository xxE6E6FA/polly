import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { CheckCircle } from "@phosphor-icons/react";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { useQuery } from "convex/react";
import { memo, useCallback, useMemo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { CommandItem } from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContextLength } from "@/lib/format-context";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import type { HydratedModel } from "@/types";

// Union type for models returned by getAvailableModels
type AvailableModel = HydratedModel;

// Memoized model item component
const ModelItemComponent = ({
  model,
  onSelect,
  hasReachedPollyLimit,
  isSelected,
  size = "sm",
}: {
  model: AvailableModel;
  onSelect: (value: string) => void;
  hasReachedPollyLimit?: boolean;
  isSelected?: boolean;
  size?: "sm" | "md";
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

  const isPollyDisabled = model.free && hasReachedPollyLimit;
  const isDisabled = isUnavailable || isPollyDisabled;

  // Format context length using utility
  const contextDisplay = formatContextLength(model.contextLength);

  const modelItem = (
    <CommandItem
      key={model.modelId}
      value={`${model.name} ${model.modelId} ${model.provider}`}
      onSelect={() => {
        if (!isDisabled) {
          handleSelect();
        }
      }}
      disabled={isDisabled}
      className={cn(
        "cursor-pointer rounded-none transition-colors",
        size === "sm"
          ? "px-3 py-2.5 text-xs"
          : "px-4 py-3 text-sm border-b border-border/40 last:border-0",
        isDisabled && "cursor-not-allowed opacity-60",
        isSelected && "bg-muted/50"
      )}
    >
      <div
        className={cn(
          "flex w-full items-center justify-between",
          size === "sm" ? "gap-2" : "gap-3"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center",
            size === "sm" ? "gap-2" : "gap-3"
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-center",
              size === "sm" ? "h-6 w-6" : "h-10 w-10"
            )}
          >
            <ProviderIcon
              provider={model.provider}
              className={cn(size === "sm" ? "h-5 w-5" : "h-8 w-8")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "font-medium truncate leading-none",
                size === "sm" ? "text-xs" : "text-sm mb-1.5"
              )}
            >
              {model.name}
            </div>
            <div className="flex gap-1 items-center flex-wrap mt-1">
              {/* Status Badges */}
              {model.free && !isPollyDisabled && (
                <Badge variant="status-free" size="xs">
                  Free
                </Badge>
              )}
              {isPollyDisabled && (
                <Badge variant="status-limit" size="xs">
                  Limit Reached
                </Badge>
              )}
              {isUnavailable && (
                <Badge variant="status-unavailable" size="xs">
                  Unavailable
                </Badge>
              )}

              {/* Capability Icons */}
              {_capabilities.map((capability, index) => {
                const IconComponent = capability.icon;
                return (
                  <Tooltip key={capability.label || `capability-${index}`}>
                    <TooltipTrigger>
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
                        <IconComponent className="h-3 w-3" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-center">
                        <p className="text-xs font-medium">
                          {capability.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {capability.description}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Context Window */}
              {contextDisplay && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex h-5 items-center justify-center rounded px-1.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      {contextDisplay.short}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-center">
                      <p className="text-xs font-medium">Context Window</p>
                      <p className="text-xs text-muted-foreground">
                        {contextDisplay.long}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
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
