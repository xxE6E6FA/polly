import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Virtualizer,
  type VirtualizerHandle,
  WindowVirtualizer,
  type WindowVirtualizerHandle,
} from "virtua";
import { type BaseModel, ModelCard } from "@/components/models/model-card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useScrollContainer } from "@/providers/scroll-container-context";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ToggleModelResult } from "@/types";

interface VirtualizedModelListProps {
  models: BaseModel[];
  // Optional scroll container for non-window scroll contexts (e.g., mobile carousels)
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Offset from the top of the scroll container to account for content above the virtualizer.
   * This tells the virtualizer that content exists before it in the scroll container.
   * When not provided, the component auto-measures its offset from the scroll container.
   * Pass an explicit value to override auto-detection.
   */
  startMargin?: number;
}

export const VirtualizedModelList = memo(
  ({
    models,
    scrollContainerRef,
    startMargin: startMarginProp,
  }: VirtualizedModelListProps) => {
    const windowVirtualizerRef = useRef<WindowVirtualizerHandle>(null);
    const containerVirtualizerRef = useRef<VirtualizerHandle>(null);
    const listContainerRef = useRef<HTMLDivElement>(null);
    const [measuredStartMargin, setMeasuredStartMargin] = useState(0);
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

    // Auto-measure startMargin for container-based scroll when not explicitly provided
    useLayoutEffect(() => {
      // Skip if startMargin is explicitly provided or not using container scroll
      if (startMarginProp !== undefined || !useContainerScroll) {
        return;
      }

      const listContainer = listContainerRef.current;
      if (!listContainer) {
        return;
      }

      const measureOffset = () => {
        const scrollContainer = effectiveScrollContainerRef?.current;
        if (!scrollContainer) {
          return;
        }

        // Measure offset from scroll container top to list container top
        const containerRect = scrollContainer.getBoundingClientRect();
        const listRect = listContainer.getBoundingClientRect();
        const offset =
          listRect.top - containerRect.top + scrollContainer.scrollTop;
        setMeasuredStartMargin(Math.max(0, Math.round(offset)));
      };

      // Measure immediately
      measureOffset();

      // Re-measure on resize
      const resizeObserver = new ResizeObserver(() => {
        measureOffset();
      });

      resizeObserver.observe(listContainer);

      const scrollContainer = effectiveScrollContainerRef?.current;
      if (scrollContainer) {
        resizeObserver.observe(scrollContainer);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }, [startMarginProp, useContainerScroll, effectiveScrollContainerRef]);

    // Use explicit prop if provided, otherwise use measured value
    const startMargin = startMarginProp ?? measuredStartMargin;

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
          // Only send identity fields - capabilities come from models.dev cache
          const modelData = {
            modelId: model.modelId,
            name: model.name,
            provider: model.provider,
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

    // Each row is approximately 172px (card height 160px + pb-3 12px)
    const estimatedRowHeight = 172;

    return (
      <div ref={listContainerRef}>
        {useContainerScroll ? (
          <Virtualizer
            ref={containerVirtualizerRef}
            overscan={4}
            itemSize={estimatedRowHeight}
            scrollRef={effectiveScrollContainerRef}
            startMargin={startMargin}
          >
            {renderRows()}
          </Virtualizer>
        ) : (
          <WindowVirtualizer
            ref={windowVirtualizerRef}
            overscan={4}
            itemSize={estimatedRowHeight}
          >
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
      </div>
    );
  }
);

VirtualizedModelList.displayName = "VirtualizedModelList";
