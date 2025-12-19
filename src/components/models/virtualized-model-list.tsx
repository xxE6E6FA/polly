import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { type BaseModel, ModelCard } from "@/components/models/model-card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useScrollContainer } from "@/providers/scroll-container-context";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ToggleModelResult } from "@/types";

// Grid list container for VirtuosoGrid
const GridList = memo(
  ({
    style,
    children,
    ...props
  }: React.ComponentProps<"div"> & { style?: React.CSSProperties }) => (
    <div
      {...props}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      style={style}
    >
      {children}
    </div>
  )
);
GridList.displayName = "GridList";

// Grid item container for VirtuosoGrid
const GridItem = memo(
  ({
    children,
    ...props
  }: React.ComponentProps<"div"> & { "data-index"?: number }) => (
    <div {...props}>{children}</div>
  )
);
GridItem.displayName = "GridItem";

interface VirtualizedModelListProps {
  models: BaseModel[];
}

// Static components for VirtuosoGrid
const gridComponents = {
  List: GridList,
  Item: GridItem,
};

export const VirtualizedModelList = memo(
  ({ models }: VirtualizedModelListProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [conflictDialog, setConflictDialog] = useState<{
      isOpen: boolean;
      model: BaseModel | null;
      conflictInfo: ToggleModelResult | null;
    }>({
      isOpen: false,
      model: null,
      conflictInfo: null,
    });

    // Track scroll container for mobile carousel support
    const scrollContainerContext = useScrollContainer();
    const [scrollParent, setScrollParent] = useState<HTMLElement | undefined>(
      undefined
    );

    // Update scroll parent when context changes (handles timing issues)
    useEffect(() => {
      const element = scrollContainerContext?.ref?.current;
      if (element) {
        setScrollParent(element);
      }
    }, [scrollContainerContext?.ref?.current]);

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

    // Render a single model card
    const renderModelCard = useCallback(
      (index: number, model: BaseModel) => (
        <ModelCard
          model={model}
          isEnabled={enabledModelsLookup.has(model.modelId)}
          onToggle={onToggleModel}
          onRemove={handleRemoveModel}
        />
      ),
      [enabledModelsLookup, onToggleModel, handleRemoveModel]
    );

    if (models.length === 0) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No models available</p>
        </div>
      );
    }

    // For small lists (< 80 models), use simple grid without virtualization
    if (models.length < 80) {
      return (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {models.map(model => (
              <ModelCard
                key={`${model.provider}-${model.modelId}`}
                model={model}
                isEnabled={enabledModelsLookup.has(model.modelId)}
                onToggle={onToggleModel}
                onRemove={handleRemoveModel}
              />
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
      <div ref={scrollRef}>
        <VirtuosoGrid
          data={models}
          overscan={200}
          components={gridComponents}
          itemContent={renderModelCard}
          {...(scrollParent
            ? { customScrollParent: scrollParent }
            : { useWindowScroll: true })}
        />
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
