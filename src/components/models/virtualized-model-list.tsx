import { api } from "@convex/_generated/api";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Virtualizer,
  type VirtualizerHandle,
  WindowVirtualizer,
  type WindowVirtualizerHandle,
} from "virtua";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContextLength } from "@/lib/format-context";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { useScrollContainer } from "@/providers/scroll-container-context";
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
  // Optional scroll container for non-window scroll contexts (e.g., mobile carousels)
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

function getModelCardClassName(
  isEnabled: boolean,
  isUnavailable: boolean
): string {
  if (isEnabled && !isUnavailable) {
    return "bg-primary/5 ring-1 ring-primary cursor-pointer";
  }
  if (isUnavailable) {
    return "bg-red-50 ring-1 ring-red-200 cursor-not-allowed dark:bg-red-950/20 dark:ring-red-800";
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

    // Format context length using utility
    const contextLength = model.contextLength || model.contextWindow;
    const contextDisplay = formatContextLength(contextLength);

    const handleSwitchChange = useCallback(
      (checked: boolean) => {
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
                isUnavailable ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
              }`}
            >
              <ProviderIcon
                provider={model.provider}
                className={`h-3 w-3 ${isUnavailable ? "text-red-600 dark:text-red-400" : ""}`}
              />
              <span
                className={`text-[10px] font-medium capitalize ${
                  isUnavailable
                    ? "text-red-700 dark:text-red-300"
                    : "text-muted-foreground"
                }`}
              >
                {model.provider}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(() => {
                if (isUnavailable && onRemove) {
                  return (
                    <Tooltip>
                      <TooltipTrigger>
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
                  );
                }
                if (isUnavailable) {
                  return (
                    <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
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
                isUnavailable ? "text-red-700 dark:text-red-300" : ""
              }`}
            >
              {model.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
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

        <Tooltip>
          <TooltipTrigger className="mt-auto min-w-0 overflow-hidden text-left">
            <div
              className={`text-xs text-ellipsis whitespace-nowrap overflow-hidden ${
                isUnavailable
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
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

export const VirtualizedModelList = memo(
  ({ models, scrollContainerRef }: VirtualizedModelListProps) => {
    const windowVirtualizerRef = useRef<WindowVirtualizerHandle>(null);
    const containerVirtualizerRef = useRef<VirtualizerHandle>(null);
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

    // Use explicit scrollContainerRef prop or fall back to context (for mobile carousel slides)
    const scrollContainerContext = useScrollContainer();

    // Determine if we should use container-based virtualization
    // Check based on prop or context presence, not ref.current value (which may not be set yet)
    const useContainerScroll =
      !!scrollContainerRef ||
      scrollContainerContext?.isInScrollContainerContext;

    // Get the effective scroll ref for the Virtualizer
    const effectiveScrollContainerRef =
      scrollContainerRef ?? scrollContainerContext?.ref;

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

    // Helper function to render model rows for virtualization
    const renderRows = () =>
      rows.map((rowModels, rowIndex) => (
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
      ));

    return (
      <>
        {useContainerScroll ? (
          <Virtualizer
            ref={containerVirtualizerRef}
            overscan={4}
            scrollRef={effectiveScrollContainerRef}
          >
            {renderRows()}
          </Virtualizer>
        ) : (
          <WindowVirtualizer ref={windowVirtualizerRef} overscan={4}>
            {renderRows()}
          </WindowVirtualizer>
        )}
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
