import { memo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelItemData } from "@/hooks/use-model-item-data";
import { cn } from "@/lib/utils";
import type { HydratedModel } from "@/types";
import { DrawerItem } from "../../drawer-item";
import { ModelItemTooltip } from "./model-item-tooltip";

const DrawerModelItemComponent = ({
  model,
  onSelect,
  hasReachedPollyLimit,
  isSelected,
  size = "md",
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

  const icon = (
    <ProviderIcon
      provider={model.free ? "polly" : model.provider}
      className={cn(size === "sm" ? "h-5 w-5" : "h-8 w-8")}
    />
  );

  const badges = (
    <>
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

      {capabilities.map((capability, index) => (
        <Tooltip key={capability.label || `capability-${index}`}>
          <TooltipTrigger>
            <div className="flex h-5 items-center justify-center rounded px-1.5 text-overline font-medium bg-muted text-muted-foreground">
              {capability.label}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="text-xs font-medium">{capability.label}</p>
              <p className="text-xs text-muted-foreground">
                {capability.description}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}

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
    </>
  );

  const drawerItem = (
    <DrawerItem
      icon={icon}
      name={model.name}
      badges={badges}
      selected={isSelected ?? false}
      onClick={handleSelect}
      disabled={isDisabled}
      iconWrapper={false}
    />
  );

  return (
    <ModelItemTooltip
      isPollyDisabled={isPollyDisabled}
      isUnavailable={isUnavailable}
      triggerClassName="w-full"
    >
      {drawerItem}
    </ModelItemTooltip>
  );
};

DrawerModelItemComponent.displayName = "DrawerModelItem";

export const DrawerModelItem = memo(DrawerModelItemComponent);
