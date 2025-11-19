import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useSelectModel } from "@/hooks/use-select-model";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { useUserDataContext } from "@/providers/user-data-context";
import { AnonymousUserUpsell } from "./AnonymousUserUpsell";
// ModelList used inside tabs component
import { ModelPickerTrigger } from "./ModelPickerTrigger";
import { ModelPickerTabs } from "./Tabs";

type ModelPickerProps = {
  className?: string;
  disabled?: boolean;
};

const ModelPickerComponent = ({
  className,
  disabled = false,
}: ModelPickerProps) => {
  const [open, setOpen] = useState(false);
  const { monthlyUsage, hasUnlimitedCalls, user } = useUserDataContext();
  const { modelGroups } = useModelCatalog();
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const { selectModel } = useSelectModel();

  const [generationMode, setGenerationMode] = useGenerationMode();
  const { params: imageParams, setParams: setImageParams } = useImageParams();
  const enabledImageModels = useEnabledImageModels() || [];
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");

  // Keep active tab in sync with current mode
  useEffect(() => {
    setActiveTab(generationMode === "image" ? "image" : "text");
  }, [generationMode]);

  const selectedModel = selectedModelRaw;

  const hasReachedPollyLimit = useMemo(
    () =>
      Boolean(
        user &&
          !user.isAnonymous &&
          monthlyUsage &&
          monthlyUsage.remainingMessages === 0 &&
          !hasUnlimitedCalls
      ),
    [user, monthlyUsage, hasUnlimitedCalls]
  );

  const handleSelect = useCallback(
    async (modelId: string, provider: string) => {
      setOpen(false);
      setGenerationMode("text");
      await selectModel(modelId, provider, [
        ...modelGroups.freeModels,
        ...Object.values(modelGroups.providerModels).flat(),
      ]);
    },
    [selectModel, modelGroups, setGenerationMode]
  );

  const handleSelectImageModel = useCallback(
    (modelId: string) => {
      setImageParams(prev => ({ ...prev, model: modelId }));
      setGenerationMode("image");
      setOpen(false);
    },
    [setImageParams, setGenerationMode]
  );

  const fallbackModel = useMemo(() => {
    if (selectedModel || user?.isAnonymous) {
      return null;
    }
    return get(CACHE_KEYS.selectedModel, null);
  }, [selectedModel, user?.isAnonymous]);

  const displayModel = selectedModel || fallbackModel;
  const selectedImageModel = enabledImageModels.find(
    m => m.modelId === (imageParams.model || "")
  );
  const triggerDisplayLabel =
    generationMode === "image"
      ? selectedImageModel?.name || selectedImageModel?.modelId || undefined
      : undefined;
  const triggerDisplayProvider =
    generationMode === "image" ? "replicate" : undefined;

  // Selected model persistence is handled by the centralized selection hook

  if (user?.isAnonymous) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <div className={className}>
          <label id="model-picker-label" className="sr-only">
            Select a model
          </label>
          <PopoverTrigger>
            <ModelPickerTrigger open={open} selectedModel={displayModel} />
          </PopoverTrigger>
        </div>
        <PopoverContent
          className="flex w-[min(calc(100vw-2rem),380px)] max-h-[min(calc(100dvh-8rem),360px)] min-h-0 flex-col overflow-hidden border border-border/50 bg-popover shadow-lg [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input]]:w-full"
          side="top"
          sideOffset={4}
          rounded
        >
          <AnonymousUserUpsell />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={disabled ? undefined : setOpen}
    >
      <div className={className}>
        <label id="model-picker-label" className="sr-only">
          Select a model
        </label>
        <Tooltip>
          <TooltipTrigger>
            <PopoverTrigger disabled={disabled}>
              <ModelPickerTrigger
                open={open}
                selectedModel={displayModel}
                displayLabel={triggerDisplayLabel}
                displayProvider={triggerDisplayProvider}
                disabled={disabled}
              />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">Select model</div>
          </TooltipContent>
        </Tooltip>
      </div>
      <PopoverContent
        className="flex w-[min(calc(100vw-2rem),380px)] max-h-[min(calc(100dvh-8rem),360px)] min-h-0 flex-col overflow-hidden border border-border/50 bg-popover shadow-lg [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input]]:w-full"
        side="top"
        sideOffset={4}
        rounded
      >
        <ModelPickerTabs
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          modelGroups={modelGroups}
          onSelectTextModel={handleSelect}
          hasReachedPollyLimit={hasReachedPollyLimit}
          imageModels={enabledImageModels}
          selectedImageModelId={imageParams.model || undefined}
          onSelectImageModel={handleSelectImageModel}
          size="sm"
          autoFocusSearch={open}
        />
      </PopoverContent>
    </Popover>
  );
};

export const ModelPicker = memo(ModelPickerComponent);
