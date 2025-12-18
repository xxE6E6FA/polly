import { CaretDown } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useBuiltInImageModels } from "@/hooks/use-built-in-image-models";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
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
  const builtInImageModels = useBuiltInImageModels();
  const { hasReplicateApiKey } = useReplicateApiKey();
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");

  // Determine if we should show the images tab
  // Hide only when: no built-in models AND no API key AND no user models
  const hasBuiltInModels = (builtInImageModels?.length ?? 0) > 0;
  const hasUserModels = enabledImageModels.length > 0;
  const showImagesTab = hasBuiltInModels || hasReplicateApiKey || hasUserModels;

  // Determine empty state type for images tab
  const getImageTabEmptyState = (): "needs-api-key" | "needs-models" | null => {
    if (hasBuiltInModels && !hasReplicateApiKey) {
      return "needs-api-key";
    }
    if (hasReplicateApiKey && !hasUserModels && !hasBuiltInModels) {
      return "needs-models";
    }
    return null;
  };
  const imageTabEmptyState = getImageTabEmptyState();

  // Text model state logic
  const hasProviderModels = Object.keys(modelGroups.providerModels).length > 0;
  const totalTextModels =
    modelGroups.freeModels.length +
    Object.values(modelGroups.providerModels).flat().length;
  const showTextSearch = totalTextModels >= 5;

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
      <CaretDown className="h-3.5 w-3.5 opacity-70" />
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

  // Anonymous user content
  if (user?.isAnonymous) {
    return (
      <ResponsivePicker
        open={open}
        onOpenChange={setOpen}
        trigger={isDesktop ? desktopTriggerContent : mobileTriggerContent}
        title="Select Model"
        tooltip="Select model"
        disabled={disabled}
        triggerClassName={className}
        pickerVariant="accent"
        ariaLabel="Select model"
        contentClassName={
          isDesktop ? "p-0" : "h-[85dvh] max-h-[85dvh] pt-0 flex flex-col"
        }
      >
        <AnonymousUserUpsell />
      </ResponsivePicker>
    );
  }

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
          showApiKeysPrompt={showApiKeysPrompt}
          onDismissApiKeysPrompt={handleDismissApiKeysPrompt}
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
          showApiKeysPrompt={showApiKeysPrompt}
          onDismissApiKeysPrompt={handleDismissApiKeysPrompt}
        />
      )}
      {activeTab === "image" && !imageTabEmptyState && (
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

import { ChatCircleIcon, KeyIcon, LightningIcon } from "@phosphor-icons/react";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

function AnonymousUserUpsell() {
  return (
    <div className="relative p-6">
      <h3 className="mb-2 text-center text-base font-semibold text-foreground">
        Sign in for more features!
      </h3>

      <div className="mb-6 stack-md">
        <div className="flex items-start gap-3">
          <ChatCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Higher message limits
            </div>
            <div className="text-xs text-muted-foreground">
              {MONTHLY_MESSAGE_LIMIT} messages/month for free
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Bring your own API keys
            </div>
            <div className="text-xs text-muted-foreground">
              Use OpenAI, Anthropic, Google and OpenRouter models
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <LightningIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">Advanced features</div>
            <div className="text-xs text-muted-foreground">
              Custom personas, conversation sharing, and more!
            </div>
          </div>
        </div>
      </div>

      <Link
        to={ROUTES.AUTH}
        className={buttonVariants({
          className: "w-full",
          size: "sm",
          variant: "default",
        })}
      >
        Sign In
      </Link>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Free to use • No credit card required
      </p>
    </div>
  );
}

export const ModelPicker = memo(ModelPickerComponent);
