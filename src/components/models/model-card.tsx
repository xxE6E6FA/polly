import { TrashIcon } from "@phosphor-icons/react";
import { memo, useCallback, useMemo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContextLength } from "@/lib/format-context";
import { getModelCapabilities } from "@/lib/model-capabilities";

export type BaseModel = {
  modelId: string;
  name: string;
  provider: string;
  contextLength?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
  supportsImages?: boolean;
  supportsFiles?: boolean;
  inputModalities?: string[];
  free?: boolean;
  isAvailable?: boolean;
  selected?: boolean;
};

function getModelCardClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  if (isEnabled && !isUnavailable) {
    return "bg-primary/5 ring-1 ring-primary cursor-pointer";
  }
  if (isUnavailable) {
    return "bg-danger-bg ring-1 ring-danger-border cursor-not-allowed";
  }
  return "bg-card ring-1 ring-input-border hover:shadow-md hover:bg-muted/30 cursor-pointer";
}

function getCapabilityIconClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  if (isEnabled && !isUnavailable) {
    return "border border-border/40 bg-background hover:bg-muted";
  }
  if (isUnavailable) {
    return "bg-danger-bg";
  }
  return "bg-muted hover:bg-muted-foreground/10";
}

function getContextBadgeClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  return getCapabilityIconClassName(isEnabled, isUnavailable);
}

export interface ModelCardProps {
  model: BaseModel;
  isEnabled: boolean;
  onToggle: (model: BaseModel) => void;
  onRemove?: (model: BaseModel) => void;
}

export const ModelCard = memo(
  ({ model, isEnabled, onToggle, onRemove }: ModelCardProps) => {
    const capabilities = useMemo(() => getModelCapabilities(model), [model]);
    const isUnavailable = model.isAvailable === false;

    const contextLength = model.contextLength || model.contextWindow;
    const contextDisplay = formatContextLength(contextLength);

    const handleSwitchChange = useCallback(
      (_checked: boolean) => {
        if (!isUnavailable) {
          onToggle(model);
        }
      },
      [model, onToggle, isUnavailable]
    );

    const handleRemoveClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onRemove && isUnavailable) {
          onRemove(model);
        }
      },
      [onRemove, model, isUnavailable]
    );

    return (
      <label
        className={`group relative min-h-[160px] rounded-lg p-4 transition-all duration-200 flex flex-col ${getModelCardClassName(
          isEnabled,
          isUnavailable
        )}`}
      >
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 ${
                isUnavailable ? "bg-danger-bg" : "bg-muted"
              }`}
            >
              <ProviderIcon
                provider={model.free ? "polly" : model.provider}
                className={`size-3 ${isUnavailable ? "text-danger" : ""}`}
              />
              <span
                className={`text-overline font-medium capitalize ${
                  isUnavailable ? "text-danger" : "text-muted-foreground"
                }`}
              >
                {model.free ? "polly" : model.provider}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(() => {
                if (isUnavailable && onRemove) {
                  return (
                    <Tooltip>
                      <TooltipTrigger delayDuration={200}>
                        <Button
                          variant="danger-subtle"
                          size="icon-sm"
                          onClick={handleRemoveClick}
                          title="Remove model"
                          aria-label="Remove unavailable model"
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Remove model</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                if (isUnavailable) {
                  return (
                    <span className="rounded bg-danger-bg px-2 py-1 text-xs text-danger">
                      Unavailable
                    </span>
                  );
                }
                return (
                  <Switch
                    checked={isEnabled}
                    disabled={isUnavailable}
                    onCheckedChange={handleSwitchChange}
                  />
                );
              })()}
            </div>
          </div>
          <div className="mb-1.5 min-h-[2.5rem]">
            <h4
              className={`break-words text-sm font-medium leading-tight line-clamp-2 ${
                isUnavailable ? "text-danger" : ""
              }`}
            >
              {model.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            {model.free && !isUnavailable && (
              <Badge variant="status-free" size="xs">
                Free
              </Badge>
            )}
            {isUnavailable && (
              <Badge variant="danger" size="xs">
                Unavailable
              </Badge>
            )}
          </div>
        </div>

        <div className="mb-3 flex items-center gap-1">
          {capabilities.map((capability, index) => {
            const IconComponent = capability.icon;
            return (
              <Tooltip key={capability.label || `capability-${index}`}>
                <TooltipTrigger>
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${getCapabilityIconClassName(
                      isEnabled,
                      isUnavailable
                    )}`}
                  >
                    <IconComponent
                      className={`size-3 ${isUnavailable ? "text-danger" : ""}`}
                    />
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
            );
          })}
          {contextDisplay && (
            <Tooltip>
              <TooltipTrigger>
                <div
                  className={`flex h-6 items-center justify-center rounded px-2 text-xs font-medium transition-colors ${getContextBadgeClassName(
                    isEnabled,
                    isUnavailable
                  )}`}
                >
                  <span
                    className={
                      isUnavailable ? "text-danger" : "text-muted-foreground"
                    }
                  >
                    {contextDisplay.short}
                  </span>
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

        <Tooltip>
          <TooltipTrigger className="mt-auto min-w-0 overflow-hidden text-left">
            <div
              className={`text-xs text-ellipsis whitespace-nowrap overflow-hidden ${
                isUnavailable ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {model.modelId}
            </div>
          </TooltipTrigger>
          <TooltipContent>{model.modelId}</TooltipContent>
        </Tooltip>
      </label>
    );
  }
);

ModelCard.displayName = "ModelCard";
