import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { WindowVirtualizer } from "virtua";
import { ProviderIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { useUserDataContext } from "@/providers/user-data-context";

type BaseModel = {
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
};

type VirtualizedModelListProps = {
  models: BaseModel[];
};

const ModelCard = memo(
  ({
    model,
    isEnabled,
    onToggle,
  }: {
    model: BaseModel;
    isEnabled: boolean;
    onToggle: (model: BaseModel) => void;
  }) => {
    const capabilities = useMemo(() => getModelCapabilities(model), [model]);

    // Simple context display calculation
    const contextLength = model.contextLength || model.contextWindow || 0;
    const contextDisplay =
      contextLength >= 1000000
        ? (() => {
            const value = contextLength / 1000000;
            const formatted = value.toFixed(1).replace(/\.0$/, "");
            return {
              short: `${formatted}M`,
              long: `${formatted}M tokens`,
            };
          })()
        : {
            short: `${(contextLength / 1000).toFixed(0)}K`,
            long: `${(contextLength / 1000).toFixed(0)}K tokens`,
          };

    const handleClick = useCallback(() => {
      onToggle(model);
    }, [model, onToggle]);

    const handleSwitchClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

    return (
      <div
        className={`group relative min-h-[160px] cursor-pointer rounded-lg border p-4 transition-all duration-200 flex flex-col ${
          isEnabled
            ? "border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:border-blue-500/50 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20"
            : "border-border/40 bg-background hover:border-border hover:bg-muted/30"
        }`}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <div className="mb-1 flex items-start gap-2">
              <h4 className="break-words text-sm font-medium leading-tight line-clamp-2">
                {model.name}
              </h4>
              {model.free && (
                <Badge
                  className="h-5 shrink-0 border-green-200 bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  variant="secondary"
                >
                  Free
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center">
              <ProviderIcon provider={model.provider} className="h-4 w-4" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              checked={isEnabled}
              onCheckedChange={handleClick}
              onClick={handleSwitchClick}
            />
          </div>
        </div>

        <div className="mb-3 flex items-center gap-1">
          {capabilities.map((capability, index) => {
            const IconComponent = capability.icon;
            return (
              <TooltipWrapper
                key={capability.label || `capability-${index}`}
                content={
                  <div className="text-center">
                    <p className="text-xs font-medium">{capability.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {capability.description}
                    </p>
                  </div>
                }
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    isEnabled
                      ? "border border-border/40 bg-background hover:bg-muted"
                      : "bg-muted hover:bg-muted-foreground/10"
                  }`}
                >
                  <IconComponent className="h-3 w-3" />
                </div>
              </TooltipWrapper>
            );
          })}
          {(model.contextLength || model.contextWindow) && (
            <TooltipWrapper
              content={
                <div className="text-center">
                  <p className="text-xs font-medium">Context Window</p>
                  <p className="text-xs text-muted-foreground">
                    {contextDisplay.long}
                  </p>
                </div>
              }
            >
              <div
                className={`flex h-6 items-center justify-center rounded px-2 text-xs font-medium transition-colors ${
                  isEnabled
                    ? "border border-border/40 bg-background hover:bg-muted"
                    : "bg-muted hover:bg-muted-foreground/10"
                }`}
              >
                <span className="text-muted-foreground">
                  {contextDisplay.short}
                </span>
              </div>
            </TooltipWrapper>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{model.modelId}</span>
        </div>
      </div>
    );
  }
);

ModelCard.displayName = "ModelCard";

export const VirtualizedModelList = memo(
  ({ models }: VirtualizedModelListProps) => {
    const [columnsPerRow, setColumnsPerRow] = useState(4);

    const { user } = useUserDataContext();
    const authenticatedUserId = user?._id;
    const enabledModels = useQuery(
      api.userModels.getUserModels,
      authenticatedUserId ? {} : "skip"
    );

    const toggleModel = useMutation(api.userModels.toggleModel);

    // Memoize enabled models lookup for better performance
    const enabledModelsLookup = enabledModels
      ? new Set(enabledModels.map(m => m.modelId))
      : new Set();

    const onToggleModel = useCallback(
      (model: BaseModel) => {
        if (!authenticatedUserId) {
          return;
        }

        // Convert BaseModel to the exact format expected by the mutation validator
        const modelData = {
          userId: authenticatedUserId,
          modelId: model.modelId,
          name: model.name,
          provider: model.provider,
          contextLength: model.contextLength || model.contextWindow || 0,
          maxOutputTokens: model.maxOutputTokens ?? undefined,
          supportsImages: Boolean(model.supportsImages),
          supportsTools: Boolean(model.supportsTools),
          supportsReasoning: Boolean(model.supportsReasoning),
          supportsFiles: model.supportsFiles ?? undefined,
          inputModalities: model.inputModalities ?? undefined,
          free: model.free ?? false,
          createdAt: Date.now(),
        };

        toggleModel({ modelId: model.modelId, modelData });
      },
      [toggleModel, authenticatedUserId]
    );

    // Calculate columns based on screen size with debounced updates
    useEffect(() => {
      const updateLayout = () => {
        if (window.innerWidth >= 1280) {
          setColumnsPerRow(4);
        } else if (window.innerWidth >= 1024) {
          setColumnsPerRow(3);
        } else if (window.innerWidth >= 768) {
          setColumnsPerRow(2);
        } else {
          setColumnsPerRow(1);
        }
      };

      updateLayout();

      // Debounce resize events for better performance
      let timeoutId: NodeJS.Timeout;
      const debouncedUpdate = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(updateLayout, 150);
      };

      window.addEventListener("resize", debouncedUpdate);
      return () => {
        window.removeEventListener("resize", debouncedUpdate);
        clearTimeout(timeoutId);
      };
    }, []);

    // Group models into rows for virtualization with memoization
    const rows = useMemo(() => {
      const result = [];
      for (let i = 0; i < models.length; i += columnsPerRow) {
        result.push(models.slice(i, i + columnsPerRow));
      }
      return result;
    }, [models, columnsPerRow]);

    if (models.length === 0) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No models available</p>
        </div>
      );
    }

    // For small lists, don't use virtualization to avoid overhead
    if (rows.length <= 20) {
      return (
        <div className="space-y-3">
          {rows.map((rowModels, rowIndex) => (
            <div
              key={`row-${rowIndex}-${rowModels[0]?.modelId || "empty"}`}
              className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {rowModels
                .filter(model => model)
                .map(model => (
                  <ModelCard
                    key={`${model.provider}-${model.modelId}`}
                    isEnabled={enabledModelsLookup.has(model.modelId)}
                    model={model}
                    onToggle={onToggleModel}
                  />
                ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <WindowVirtualizer>
        {rows.map((rowModels, rowIndex) => (
          <div
            key={`row-${rowIndex}-${rowModels[0]?.modelId || "empty"}`}
            className="pb-3"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rowModels
                .filter(model => model)
                .map(model => (
                  <ModelCard
                    key={`${model.provider}-${model.modelId}`}
                    isEnabled={enabledModelsLookup.has(model.modelId)}
                    model={model}
                    onToggle={onToggleModel}
                  />
                ))}
            </div>
          </div>
        ))}
      </WindowVirtualizer>
    );
  }
);

VirtualizedModelList.displayName = "VirtualizedModelList";
