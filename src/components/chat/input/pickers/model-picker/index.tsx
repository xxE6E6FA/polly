import { CaretDown } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import { ModelDrawerTabs } from "./drawer-tabs";
import { ModelPickerTabs } from "./tabs";

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
  // Use shared hook instead of direct query - provides caching for instant display
  const { selectedModel, selectModel } = useSelectedModel();
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const [generationMode, setGenerationMode] = useGenerationMode();
  const { params: imageParams, setParams: setImageParams } = useImageParams();
  const enabledImageModels = useEnabledImageModels() || [];
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");

  // Determine if we should show the images tab
  // Show if there are any image models available (built-in or user)
  const hasAnyImageModels = enabledImageModels.length > 0;
  const showImagesTab = hasAnyImageModels;

  // Show empty state only if no models at all (edge case)
  const imageTabEmptyState: "needs-models" | null = hasAnyImageModels
    ? null
    : "needs-models";

  // Text model state logic
  const hasProviderModels = Object.keys(modelGroups.providerModels).length > 0;
  const totalTextModels =
    modelGroups.freeModels.length +
    Object.values(modelGroups.providerModels).flat().length;
  const showTextSearch = totalTextModels >= 5;
  const showImageSearch = enabledImageModels.length >= 5;

  // API keys prompt dismissal state (only show if no provider models)
  const [apiKeysPromptDismissed, setApiKeysPromptDismissed] = useState(() =>
    get(CACHE_KEYS.apiKeysPromptDismissed, false)
  );

  const handleDismissApiKeysPrompt = useCallback(() => {
    setApiKeysPromptDismissed(true);
    set(CACHE_KEYS.apiKeysPromptDismissed, true);
  }, []);

  const showApiKeysPrompt = !(hasProviderModels || apiKeysPromptDismissed);

  // Show static display when: single model + no provider keys + prompt dismissed
  const showStaticDisplay =
    totalTextModels === 1 && !hasProviderModels && apiKeysPromptDismissed;

  // Keep active tab in sync with current mode
  useEffect(() => {
    setActiveTab(generationMode === "image" ? "image" : "text");
  }, [generationMode]);

  // Switch to text tab if images tab becomes hidden
  useEffect(() => {
    if (!showImagesTab && activeTab === "image") {
      setActiveTab("text");
      setGenerationMode("text");
    }
  }, [showImagesTab, activeTab, setGenerationMode]);

  const hasReachedPollyLimit = useMemo(
    () =>
      Boolean(
        user &&
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

  // selectedModel already includes cached fallback from useSelectedModel hook
  const displayModel = selectedModel;
  const selectedImageModel = enabledImageModels.find(
    m => m.modelId === (imageParams.model || "")
  );

  // Determine trigger label based on generation mode
  const triggerLabel =
    generationMode === "image"
      ? selectedImageModel?.name ||
        selectedImageModel?.modelId ||
        "Select model"
      : displayModel?.name || "Select model";

  // Determine provider for the icon
  // Show "polly" icon for free built-in models, otherwise show actual provider
  const getTextModelProvider = () => {
    if (displayModel && "free" in displayModel && displayModel.free) {
      return "polly";
    }
    return displayModel?.provider;
  };
  const triggerProvider =
    generationMode === "image"
      ? selectedImageModel?.provider || "replicate" // Image models are from Replicate
      : getTextModelProvider();

  // Desktop trigger content (icon + label with caret)
  const desktopTriggerContent = (
    <>
      <div className="flex items-center gap-1.5">
        <ProviderIcon provider={triggerProvider} className="h-3.5 w-3.5" />
        <span className="max-w-[180px] truncate font-semibold tracking-tight">
          {triggerLabel}
        </span>
      </div>
      <CaretDown className="size-3.5 opacity-70" />
    </>
  );

  // Mobile trigger content (just icon)
  const mobileTriggerContent = (
    <ProviderIcon provider={triggerProvider} className="h-4 w-4" />
  );

  // Static display when there's only one model and nothing to pick
  if (showStaticDisplay) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-full",
          "bg-muted/40 border border-border/30 text-xs",
          className
        )}
      >
        <ProviderIcon provider={triggerProvider} className="h-3.5 w-3.5" />
        {isDesktop && (
          <span className="max-w-[180px] truncate font-semibold tracking-tight text-foreground/80">
            {triggerLabel}
          </span>
        )}
      </div>
    );
  }

  // For anonymous users, show model picker with upsell banner
  const isAnonymous = !!user?.isAnonymous;

  // Model picker content (shared between mobile and desktop)
  const modelPickerContent = (
    <>
      {isDesktop ? (
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
          className="flex-1 min-h-0"
          selectedModelId={selectedModel?.modelId}
          showImagesTab={showImagesTab}
          imageTabEmptyState={imageTabEmptyState}
          showTextSearch={showTextSearch}
          showImageSearch={showImageSearch}
          showApiKeysPrompt={!isAnonymous && showApiKeysPrompt}
          onDismissApiKeysPrompt={handleDismissApiKeysPrompt}
          showSignInPrompt={isAnonymous}
          generationMode={generationMode}
        />
      ) : (
        <ModelDrawerTabs
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          modelGroups={modelGroups}
          onSelectTextModel={handleSelect}
          hasReachedPollyLimit={hasReachedPollyLimit}
          selectedModelId={selectedModel?.modelId}
          imageModels={enabledImageModels}
          selectedImageModelId={imageParams.model || undefined}
          onSelectImageModel={handleSelectImageModel}
          size="md"
          showImagesTab={showImagesTab}
          imageTabEmptyState={imageTabEmptyState}
          showTextSearch={showTextSearch}
          showImageSearch={showImageSearch}
          showApiKeysPrompt={!isAnonymous && showApiKeysPrompt}
          onDismissApiKeysPrompt={handleDismissApiKeysPrompt}
          showSignInPrompt={isAnonymous}
        />
      )}
      {activeTab === "image" && !imageTabEmptyState && !isAnonymous && (
        <div
          className={
            isDesktop
              ? "shrink-0 border-t border-border/40 mt-1 px-3 pb-3"
              : "mt-4"
          }
        >
          <Label className="text-sm font-medium">Custom Model ID</Label>
          <Input
            value={
              enabledImageModels.find(
                m => m.modelId === (imageParams.model || "")
              )
                ? ""
                : imageParams.model || ""
            }
            onChange={e =>
              setImageParams(prev => ({ ...prev, model: e.target.value }))
            }
            placeholder="e.g., user/model-name"
            className="h-9 mt-1.5"
            onKeyDown={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={setOpen}
      trigger={isDesktop ? desktopTriggerContent : mobileTriggerContent}
      title="Models"
      tooltip="Select model"
      disabled={disabled}
      triggerClassName={className}
      pickerVariant="accent"
      ariaLabel="Select model"
      contentClassName={
        isDesktop
          ? "flex flex-col overflow-hidden p-0"
          : "p-0 flex flex-col overflow-hidden"
      }
    >
      {modelPickerContent}
    </ResponsivePicker>
  );
};

export const ModelPicker = memo(ModelPickerComponent);
