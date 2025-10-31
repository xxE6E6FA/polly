import { api } from "@convex/_generated/api";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { WindowVirtualizer } from "virtua";
import { ProviderIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ToggleModelResult } from "@/types";

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
  isAvailable?: boolean;
  selected?: boolean;
};

interface VirtualizedModelListProps {
  models: BaseModel[];
}

function getModelCardClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  if (isEnabled && !isUnavailable) {
    return "border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:border-blue-500/50 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20";
  }
  if (isUnavailable) {
    return "border-red-200 bg-red-50 cursor-not-allowed dark:border-red-800 dark:bg-red-950/20";
  }
  return "border-border/40 bg-background hover:border-border hover:bg-muted/30";
}

function getCapabilityIconClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  if (isEnabled && !isUnavailable) {
    return "border border-border/40 bg-background hover:bg-muted";
  }
  if (isUnavailable) {
    return "bg-red-100 dark:bg-red-900/30";
  }
  return "bg-muted hover:bg-muted-foreground/10";
}

function getContextBadgeClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  return getCapabilityIconClassName(isEnabled, isUnavailable);
}

const ModelCard = memo(
  ({
    model,
    isEnabled,
    onToggle,
    onRemove,
  }: {
    model: BaseModel;
    isEnabled: boolean;
    onToggle: (model: BaseModel) => void;
    onRemove?: (model: BaseModel) => void;
  }) => {
    const capabilities = useMemo(() => getModelCapabilities(model), [model]);
    const isUnavailable = model.isAvailable === false;

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
      if (!isUnavailable) {
        onToggle(model);
      }
    }, [model, onToggle, isUnavailable]);

    const handleSwitchClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

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
      <div
        className={`group relative min-h-[160px] rounded-lg border p-4 transition-all duration-200 flex flex-col ${getModelCardClassName(
          isEnabled,
          isUnavailable
        )}`}
        onClick={handleClick}
        onKeyDown={e => {
          if ((e.key === "Enter" || e.key === " ") && !isUnavailable) {
            e.preventDefault();
            handleClick();
          }
        }}
        role={isUnavailable ? "button" : "button"}
        tabIndex={isUnavailable ? -1 : 0}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h4
              className={`mb-1.5 break-words text-sm font-medium leading-tight line-clamp-2 ${
                isUnavailable ? "text-red-700 dark:text-red-300" : ""
              }`}
            >
              {model.name}
            </h4>
            <div className="flex items-center gap-2">
              <ProviderIcon
                provider={model.provider}
                className={`h-4 w-4 ${isUnavailable ? "text-red-600 dark:text-red-400" : ""}`}
              />
              {model.free && !isUnavailable && (
                <Badge
                  className="h-5 shrink-0 border-green-200 bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  variant="secondary"
                >
                  Free
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
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isUnavailable ? (
              onRemove ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveClick}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      title="Remove model"
                      aria-label="Remove unavailable model"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove model</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
                  Unavailable
                </span>
              )
            ) : (
              <Switch
                checked={isEnabled}
                onCheckedChange={handleClick}
                onClick={handleSwitchClick}
                disabled={isUnavailable}
              />
            )}
          </div>
        </div>

        <div className="mb-3 flex items-center gap-1">
          {capabilities.map((capability, index) => {
            const IconComponent = capability.icon;
            return (
              <Tooltip key={capability.label || `capability-${index}`}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${getCapabilityIconClassName(
                      isEnabled,
                      isUnavailable
                    )}`}
                  >
                    <IconComponent
                      className={`h-3 w-3 ${isUnavailable ? "text-red-600 dark:text-red-400" : ""}`}
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
          {(model.contextLength || model.contextWindow) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex h-6 items-center justify-center rounded px-2 text-xs font-medium transition-colors ${getContextBadgeClassName(
                    isEnabled,
                    isUnavailable
                  )}`}
                >
                  <span
                    className={
                      isUnavailable
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
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

        <div
          className={`mt-auto flex items-center gap-2 text-xs ${
            isUnavailable
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          }`}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate">{model.modelId}</span>
            </TooltipTrigger>
            <TooltipContent>{model.modelId}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }
);

ModelCard.displayName = "ModelCard";

export const VirtualizedModelList = memo(
  ({ models }: VirtualizedModelListProps) => {
    const [columnsPerRow, setColumnsPerRow] = useState(4);
    const [conflictDialog, setConflictDialog] = useState<{
      isOpen: boolean;
      model: BaseModel | null;
      conflictInfo: ToggleModelResult | null;
    }>({
      isOpen: false,
      model: null,
      conflictInfo: null,
    });

    const { user } = useUserDataContext();
    const managedToast = useToast();
    const authenticatedUserId = user?._id;
    const enabledModels = useQuery(
      api.userModels.getUserModels,
      authenticatedUserId ? {} : "skip"
    );

    const toggleModel = useMutation(api.userModels.toggleModel);
    const removeModel = useMutation(api.userModels.removeModel);

    // Memoize enabled models lookup for better performance
    const enabledModelsLookup = enabledModels
      ? new Set(enabledModels.map((m: BaseModel) => m.modelId))
      : new Set();

    const handleRemoveModel = useCallback(
      async (model: BaseModel) => {
        if (!authenticatedUserId) {
          return;
        }

        try {
          const result = await removeModel({
            modelId: model.modelId,
            provider: model.provider,
          });

          if (result.success) {
            managedToast.success("Model removed successfully");
          } else {
            managedToast.error(result.error || "Failed to remove model");
          }
        } catch (_error) {
          managedToast.error("Failed to remove model");
        }
      },
      [
        removeModel,
        authenticatedUserId,
        managedToast.success,
        managedToast.error,
      ]
    );

    const handleToggleModel = useCallback(
      async (model: BaseModel, acknowledgeConflict = false) => {
        if (!authenticatedUserId) {
          return;
        }

        try {
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

          const result = (await toggleModel({
            modelId: model.modelId,
            modelData,
            acknowledgeConflict,
          })) as ToggleModelResult;

          if (!result.success) {
            if (result.requiresConfirmation) {
              // Show conflict dialog
              setConflictDialog({
                isOpen: true,
                model,
                conflictInfo: result,
              });
              return;
            }

            // Show error toast
            managedToast.error(result.error || "Failed to toggle model");
            return;
          }

          // Success toast
          const action = result.action === "added" ? "enabled" : "disabled";
          let message = `Model ${action} successfully`;

          if (result.overridesBuiltIn) {
            message += " (using your API key instead of free Polly model)";
          }

          managedToast.success(message);
        } catch (_error) {
          managedToast.error("Failed to toggle model");
        }
      },
      [
        toggleModel,
        authenticatedUserId,
        managedToast.success,
        managedToast.error,
      ]
    );

    const onToggleModel = useCallback(
      (model: BaseModel) => {
        handleToggleModel(model, false);
      },
      [handleToggleModel]
    );

    const handleConflictConfirm = useCallback(() => {
      if (conflictDialog.model) {
        handleToggleModel(conflictDialog.model, true);
      }
      setConflictDialog({ isOpen: false, model: null, conflictInfo: null });
    }, [conflictDialog.model, handleToggleModel]);

    const handleConflictCancel = useCallback(() => {
      setConflictDialog({ isOpen: false, model: null, conflictInfo: null });
    }, []);

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
        <>
          <div className="stack-md">
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
                      onRemove={handleRemoveModel}
                    />
                  ))}
              </div>
            ))}
          </div>
          <ConfirmationDialog
            open={conflictDialog.isOpen}
            onOpenChange={open => {
              if (!open) {
                setConflictDialog({
                  isOpen: false,
                  model: null,
                  conflictInfo: null,
                });
              }
            }}
            onConfirm={handleConflictConfirm}
            onCancel={handleConflictCancel}
            title="Model Conflict"
            description={
              conflictDialog.conflictInfo?.message ||
              "You already have this model enabled. Do you want to override it?"
            }
            confirmText="Use My API Key"
            cancelText="Keep Free Model"
          />
        </>
      );
    }

    return (
      <>
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
                      onRemove={handleRemoveModel}
                    />
                  ))}
              </div>
            </div>
          ))}
        </WindowVirtualizer>
        <ConfirmationDialog
          open={conflictDialog.isOpen}
          onOpenChange={open => {
            if (!open) {
              setConflictDialog({
                isOpen: false,
                model: null,
                conflictInfo: null,
              });
            }
          }}
          onConfirm={handleConflictConfirm}
          onCancel={handleConflictCancel}
          title="Model Conflict"
          description={
            conflictDialog.conflictInfo?.message ||
            "You already have this model enabled. Do you want to override it?"
          }
          confirmText="Use My API Key"
          cancelText="Keep Free Model"
        />
      </>
    );
  }
);

VirtualizedModelList.displayName = "VirtualizedModelList";
