import { CheckCircle } from "@phosphor-icons/react";
import { memo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { CommandItem } from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelItemData } from "@/hooks/use-model-item-data";
import { cn } from "@/lib/utils";
import type { HydratedModel } from "@/types";
import { ModelItemTooltip } from "./model-item-tooltip";

const ModelItemComponent = ({
  model,
  onSelect,
  hasReachedPollyLimit,
  isSelected,
  size = "sm",
}: {
  model: HydratedModel;
  onSelect: (value: string) => void;
  hasReachedPollyLimit?: boolean;
  isSelected?: boolean;
  size?: "sm" | "md";
}) => {
  const {
    isUnavailable,
    capabilities,
    handleSelect,
    isPollyDisabled,
    isDisabled,
    contextDisplay,
  } = useModelItemData(model, onSelect, hasReachedPollyLimit);

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
        isDisabled && "cursor-not-allowed opacity-50",
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
              provider={model.free ? "polly" : model.provider}
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

              {capabilities.map((capability, index) => {
                const IconComponent = capability.icon;
                return (
                  <Tooltip key={capability.label || `capability-${index}`}>
                    <TooltipTrigger>
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
                        <IconComponent className="size-3" />
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

              {contextDisplay && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex h-5 items-center justify-center rounded px-1.5 text-overline font-medium bg-muted text-muted-foreground">
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
              className="size-5 fill-primary text-primary-foreground"
              weight="fill"
            />
          </div>
        )}
      </div>
    </CommandItem>
  );

  return (
    <ModelItemTooltip
      isPollyDisabled={isPollyDisabled}
      isUnavailable={isUnavailable}
    >
      {modelItem}
    </ModelItemTooltip>
  );
};

ModelItemComponent.displayName = "ModelItem";

export const ModelItem = memo(ModelItemComponent);
