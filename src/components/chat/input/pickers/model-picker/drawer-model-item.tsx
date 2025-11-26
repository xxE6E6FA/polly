import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { useQuery } from "convex/react";
import { memo, useCallback, useMemo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContextLength } from "@/lib/format-context";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import { DrawerItem } from "../../drawer-item";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

const DrawerModelItemComponent = ({
  model,
  onSelect,
  hasReachedPollyLimit,
  isSelected,
  size = "md",
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

  const contextDisplay = formatContextLength(model.contextLength);

  const icon = (
    <ProviderIcon
      provider={model.provider}
      className={cn(size === "sm" ? "h-5 w-5" : "h-8 w-8")}
    />
  );

  const badges = (
    <>
      {model.free && !isPollyDisabled && (
        <Badge
          className="h-5 shrink-0 border-green-200 bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
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

      {capabilities.map((capability, index) => (
        <Tooltip key={capability.label || `capability-${index}`}>
          <TooltipTrigger>
            <div className="flex h-5 items-center justify-center rounded px-1.5 text-[10px] font-medium bg-muted text-muted-foreground">
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

  if (isPollyDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger className="w-full">{drawerItem}</TooltipTrigger>
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
        <TooltipTrigger className="w-full">{drawerItem}</TooltipTrigger>
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

  return drawerItem;
};

DrawerModelItemComponent.displayName = "DrawerModelItem";

export const DrawerModelItem = memo(DrawerModelItemComponent);
