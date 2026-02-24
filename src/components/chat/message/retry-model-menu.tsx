import {
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  NotePencilIcon,
} from "@phosphor-icons/react";
import { PROVIDER_CONFIG } from "@shared/provider-constants";
import { memo, useCallback, useMemo, useState } from "react";
import { RefreshCwIcon } from "@/components/animate-ui/icons/refresh-cw";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import type { HydratedModel } from "@/types";
import { ActionButton, DRAWER_ICON_SIZE, DrawerItem } from "./action-button";

// Union type for models from getAvailableModels
type AvailableModel = HydratedModel;

export type RetryDropdownProps = {
  isUser: boolean;
  isRetrying: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  messageId?: string;
  onRetry: (modelId?: string, provider?: string) => void;
  onRefine?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDropdownOpenChange?: (open: boolean) => void;
  currentModel?: string;
  currentProvider?: string;
};

export const RetryDropdown = memo(
  ({
    isUser,
    isRetrying,
    isStreaming,
    isEditing,
    messageId,
    onRetry,
    onRefine,
    onDropdownOpenChange,
    currentModel,
    currentProvider,
  }: RetryDropdownProps) => {
    const [open, setOpen] = useState(false);
    const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
    const [isRefineDialogOpen, setIsRefineDialogOpen] = useState(false);
    const [refineText, setRefineText] = useState("");
    const { modelGroups, userModels } = useModelCatalog();
    const enabledImageModels = useEnabledImageModels();
    const { selectModel } = useSelectedModel();

    const normalizedProvider = currentProvider?.toLowerCase();
    const isImageProvider = normalizedProvider === "replicate";

    // Common type for image models (user or built-in)
    type ImageModelOption = {
      modelId: string;
      name: string;
      provider: string;
      description?: string;
      free?: boolean;
      isBuiltIn?: boolean;
      supportsMultipleImages?: boolean;
      supportsNegativePrompt?: boolean;
      supportsImageToImage?: boolean;
    };

    const imageModelOptions = useMemo((): ImageModelOption[] => {
      if (!enabledImageModels) {
        return [];
      }
      // Sort built-in (free) models first, then by name
      return [...enabledImageModels].sort((a, b) => {
        const aBuiltIn = "isBuiltIn" in a && a.isBuiltIn;
        const bBuiltIn = "isBuiltIn" in b && b.isBuiltIn;
        if (aBuiltIn && !bBuiltIn) {
          return -1;
        }
        if (!aBuiltIn && bBuiltIn) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });
    }, [enabledImageModels]);

    const handleOpenChange = (newOpen: boolean) => {
      setOpen(newOpen);
      onDropdownOpenChange?.(newOpen);
    };

    const handleMobileSheetOpenChange = (newOpen: boolean) => {
      setIsMobileSheetOpen(newOpen);
      onDropdownOpenChange?.(newOpen);
    };

    const handleRetry = useCallback(
      async (modelId?: string, provider?: string) => {
        setOpen(false);
        setIsMobileSheetOpen(false);
        onDropdownOpenChange?.(false);

        // If a specific model is selected, update the selected model
        if (
          modelId &&
          provider &&
          provider.toLowerCase() !== "replicate" &&
          Array.isArray(userModels)
        ) {
          await selectModel(modelId, provider, userModels as AvailableModel[]);
        }

        onRetry(modelId, provider);
      },
      [userModels, onRetry, onDropdownOpenChange, selectModel]
    );

    const handleRetrySame = () => {
      setOpen(false);
      setIsMobileSheetOpen(false);
      onDropdownOpenChange?.(false);
      if (currentModel && currentProvider) {
        onRetry(currentModel, currentProvider);
      } else {
        onRetry();
      }
    };

    const handleRefine = (
      type: "custom" | "add_details" | "more_concise",
      instruction?: string
    ) => {
      if (!messageId) {
        return;
      }
      if (!onRefine) {
        return;
      }
      setOpen(false);
      setIsMobileSheetOpen(false);
      onDropdownOpenChange?.(false);
      onRefine(messageId, type, instruction);
    };

    const renderTextModelList = () => (
      <>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Try a different model
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {/* Free Models Group */}
        {modelGroups.freeModels.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2">
              <ProviderIcon
                provider="polly"
                className="h-4 w-4 text-foreground"
              />
              <span>Polly</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
              {modelGroups.freeModels.map((model: AvailableModel) => {
                const capabilities = getModelCapabilities({
                  modelId: model.modelId,
                  provider: model.provider,
                  name: model.name,
                  contextLength: model.contextLength,
                  supportsReasoning: model.supportsReasoning,
                  supportsImages: model.supportsImages,
                  supportsTools: model.supportsTools,
                  supportsFiles: model.supportsFiles,
                  inputModalities: model.inputModalities,
                });
                return (
                  <DropdownMenuItem
                    key={model.modelId}
                    onClick={() => handleRetry(model.modelId, model.provider)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{model.name}</span>
                      {model.free && (
                        <span className="text-xs bg-success-bg text-success px-2 py-0.5 rounded">
                          Free
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 ml-2">
                      {capabilities.length > 0 &&
                        capabilities.slice(0, 3).map((capability, index) => {
                          const IconComponent = capability.icon;
                          return (
                            <Tooltip
                              key={`${model.modelId}-${capability.label}-${index}`}
                            >
                              <TooltipTrigger>
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-md bg-muted/70 transition-all duration-200 hover:bg-muted/90 dark:bg-muted/50 dark:hover:bg-muted/70">
                                  <IconComponent className="size-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div>
                                  <div className="font-semibold text-foreground">
                                    {capability.label}
                                  </div>
                                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {capability.description}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Provider Groups as Submenus */}
        {Object.entries(modelGroups.providerModels).map(
          ([providerId, models]) => {
            const providerConfig =
              PROVIDER_CONFIG[providerId as keyof typeof PROVIDER_CONFIG];
            const providerTitle = providerConfig?.title || providerId;

            return (
              <DropdownMenuSub key={providerId}>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <ProviderIcon
                    provider={providerId}
                    className="h-4 w-4 text-foreground"
                  />
                  <span>{providerTitle}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                  {models.map((model: AvailableModel) => {
                    const capabilities = getModelCapabilities({
                      modelId: model.modelId,
                      provider: model.provider,
                      name: model.name,
                      contextLength: model.contextLength,
                      supportsReasoning: model.supportsReasoning,
                      supportsImages: model.supportsImages,
                      supportsTools: model.supportsTools,
                      supportsFiles: model.supportsFiles,
                      inputModalities: model.inputModalities,
                    });
                    return (
                      <DropdownMenuItem
                        key={model.modelId}
                        onClick={() =>
                          handleRetry(model.modelId, model.provider)
                        }
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate">{model.name}</span>
                          {model.free && (
                            <span className="text-xs bg-success-bg text-success px-2 py-0.5 rounded">
                              Free
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 ml-2">
                          {capabilities.length > 0 &&
                            capabilities
                              .slice(0, 3)
                              .map((capability, index) => {
                                const IconComponent = capability.icon;
                                return (
                                  <Tooltip
                                    key={`${model.modelId}-${capability.label}-${index}`}
                                  >
                                    <TooltipTrigger>
                                      <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-md bg-muted/70 transition-all duration-200 hover:bg-muted/90 dark:bg-muted/50 dark:hover:bg-muted/70">
                                        <IconComponent className="size-3" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div>
                                        <div className="font-semibold text-foreground">
                                          {capability.label}
                                        </div>
                                        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                          {capability.description}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
        )}
      </>
    );

    const renderImageModelItem = (
      model: (typeof imageModelOptions)[number]
    ) => {
      const tags: string[] = [];
      if (model.supportsMultipleImages) {
        tags.push("Multi");
      }
      if (model.supportsNegativePrompt) {
        tags.push("Negative");
      }
      if (model.supportsImageToImage) {
        tags.push("Img2Img");
      }
      const isSelected = currentModel === model.modelId;
      return (
        <DropdownMenuItem
          key={model.modelId}
          onClick={() => handleRetry(model.modelId, model.provider)}
          className={cn(
            "flex items-center justify-between cursor-pointer",
            isSelected && "bg-primary/5 hover:bg-primary/10"
          )}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{model.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {model.modelId}
            </span>
          </div>
          <div className="ml-2 flex shrink-0 gap-1">
            {tags.map(tag => (
              <span
                key={`${model.modelId}-${tag}`}
                className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </DropdownMenuItem>
      );
    };

    const renderImageModelList = () => {
      // Count unique providers to decide flat list vs submenus
      const uniqueProviders = new Set(imageModelOptions.map(m => m.provider));
      const hasSingleProvider = uniqueProviders.size <= 1;

      if (imageModelOptions.length === 0) {
        return (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {enabledImageModels === undefined
              ? "Loading image models..."
              : "No image models enabled. Manage models in Settings → Image models."}
          </div>
        );
      }

      // Single provider: flat list directly in dropdown
      if (hasSingleProvider) {
        return (
          <div className="max-h-[min(400px,50vh)] overflow-y-auto">
            {imageModelOptions.map(renderImageModelItem)}
          </div>
        );
      }

      // Multiple providers: group into submenus
      const providerGroups = Map.groupBy(imageModelOptions, m => m.provider);
      return (
        <>
          {Array.from(providerGroups.entries()).map(([providerId, models]) => (
            <DropdownMenuSub key={providerId}>
              <DropdownMenuSubTrigger className="flex items-center gap-2">
                <ProviderIcon
                  provider={providerId}
                  className="h-4 w-4 text-foreground"
                />
                <span>
                  {PROVIDER_CONFIG[providerId as keyof typeof PROVIDER_CONFIG]
                    ?.title || providerId}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[min(400px,50vh)] overflow-y-auto">
                {models.map(renderImageModelItem)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </>
      );
    };

    const renderTextModelListMobile = () => (
      <>
        <div className="text-xs font-medium text-muted-foreground px-2 py-2">
          Try a different model
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {modelGroups.freeModels.length > 0 && (
            <div className="border-b border-border/30">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                <ProviderIcon
                  provider="polly"
                  className="h-4 w-4 text-foreground"
                />
                <span className="font-medium text-sm">Polly</span>
              </div>
              {modelGroups.freeModels.map((model: AvailableModel) => {
                const capabilities = getModelCapabilities({
                  modelId: model.modelId,
                  provider: model.provider,
                  name: model.name,
                  contextLength: model.contextLength,
                  supportsReasoning: model.supportsReasoning,
                  supportsImages: model.supportsImages,
                  supportsTools: model.supportsTools,
                  supportsFiles: model.supportsFiles,
                  inputModalities: model.inputModalities,
                });
                return (
                  <button
                    key={model.modelId}
                    onClick={() => handleRetry(model.modelId, model.provider)}
                    className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{model.name}</span>
                      {model.free && (
                        <span className="text-xs bg-success-bg text-success px-2 py-0.5 rounded">
                          Free
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 ml-2">
                      {capabilities.length > 0 &&
                        capabilities.slice(0, 3).map((capability, index) => {
                          const IconComponent = capability.icon;
                          return (
                            <div
                              key={`${model.modelId}-${capability.label}-${index}`}
                              className="flex h-5 w-5 items-center justify-center rounded-md bg-muted/70"
                              title={capability.label}
                            >
                              <IconComponent className="size-3" />
                            </div>
                          );
                        })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {Object.entries(modelGroups.providerModels).map(
            ([providerId, models]) => {
              const providerConfig =
                PROVIDER_CONFIG[providerId as keyof typeof PROVIDER_CONFIG];
              const providerTitle = providerConfig?.title || providerId;

              return (
                <div
                  key={providerId}
                  className="border-b border-border/30 last:border-b-0"
                >
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                    <ProviderIcon
                      provider={providerId}
                      className="h-4 w-4 text-foreground"
                    />
                    <span className="font-medium text-sm">{providerTitle}</span>
                  </div>
                  {models.map((model: AvailableModel) => {
                    const capabilities = getModelCapabilities({
                      modelId: model.modelId,
                      provider: model.provider,
                      name: model.name,
                      contextLength: model.contextLength,
                      supportsReasoning: model.supportsReasoning,
                      supportsImages: model.supportsImages,
                      supportsTools: model.supportsTools,
                      supportsFiles: model.supportsFiles,
                      inputModalities: model.inputModalities,
                    });
                    return (
                      <button
                        key={model.modelId}
                        onClick={() =>
                          handleRetry(model.modelId, model.provider)
                        }
                        className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate">{model.name}</span>
                          {model.free && (
                            <span className="text-xs bg-success-bg text-success px-2 py-0.5 rounded">
                              Free
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 ml-2">
                          {capabilities.length > 0 &&
                            capabilities
                              .slice(0, 3)
                              .map((capability, index) => {
                                const IconComponent = capability.icon;
                                return (
                                  <div
                                    key={`${model.modelId}-${capability.label}-${index}`}
                                    className="flex h-5 w-5 items-center justify-center rounded-md bg-muted/70"
                                    title={capability.label}
                                  >
                                    <IconComponent className="size-3" />
                                  </div>
                                );
                              })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            }
          )}
        </div>
      </>
    );

    const renderImageModelItemMobile = (
      model: (typeof imageModelOptions)[number]
    ) => {
      const tags: string[] = [];
      if (model.supportsMultipleImages) {
        tags.push("Multi");
      }
      if (model.supportsNegativePrompt) {
        tags.push("Negative");
      }
      if (model.supportsImageToImage) {
        tags.push("Img2Img");
      }
      const isSelected = currentModel === model.modelId;
      return (
        <button
          key={model.modelId}
          onClick={() => handleRetry(model.modelId, model.provider)}
          className={cn(
            "flex items-center justify-between w-full px-3 py-2.5 text-left transition-colors",
            "border-b border-border/30 last:border-b-0",
            "hover:bg-muted/50",
            isSelected && "bg-primary/5 hover:bg-primary/10"
          )}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{model.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {model.modelId}
            </span>
          </div>
          <div className="ml-2 flex shrink-0 gap-1">
            {tags.map(tag => (
              <span
                key={`${model.modelId}-${tag}`}
                className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </button>
      );
    };

    const renderImageModelListMobile = () => {
      // Count unique providers to decide flat list vs grouped
      const uniqueProviders = new Set(imageModelOptions.map(m => m.provider));
      const hasSingleProvider = uniqueProviders.size <= 1;

      if (imageModelOptions.length === 0) {
        return (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {enabledImageModels === undefined
              ? "Loading image models..."
              : "No image models enabled. Manage models in Settings → Image models."}
          </div>
        );
      }

      // Single provider: flat list
      if (hasSingleProvider) {
        return (
          <>
            <div className="text-xs font-medium text-muted-foreground px-2 py-2">
              Try a different image model
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {imageModelOptions.map(renderImageModelItemMobile)}
            </div>
          </>
        );
      }

      // Multiple providers: grouped list
      const providerGroups = Map.groupBy(imageModelOptions, m => m.provider);
      return (
        <>
          <div className="text-xs font-medium text-muted-foreground px-2 py-2">
            Try a different image model
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {Array.from(providerGroups.entries()).map(
              ([providerId, models]) => (
                <div
                  key={providerId}
                  className="border-b border-border/30 last:border-b-0"
                >
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                    <ProviderIcon
                      provider={providerId}
                      className="h-4 w-4 text-foreground"
                    />
                    <span className="font-medium text-sm">
                      {PROVIDER_CONFIG[
                        providerId as keyof typeof PROVIDER_CONFIG
                      ]?.title || providerId}
                    </span>
                  </div>
                  {models.map(renderImageModelItemMobile)}
                </div>
              )
            )}
          </div>
        </>
      );
    };

    const renderModelList = () =>
      isImageProvider ? renderImageModelList() : renderTextModelList();

    const renderModelListMobile = () =>
      isImageProvider
        ? renderImageModelListMobile()
        : renderTextModelListMobile();

    return (
      <>
        {/* Desktop: Dropdown */}
        <div className="hidden sm:block">
          <DropdownMenu open={open} onOpenChange={handleOpenChange}>
            <Tooltip>
              <TooltipTrigger>
                <DropdownMenuTrigger
                  render={
                    <ActionButton
                      disabled={isEditing || isRetrying || isStreaming}
                      title={
                        isUser
                          ? "Retry from this message"
                          : "Retry this response"
                      }
                      aria-label={
                        isUser
                          ? "Retry conversation from this message"
                          : "Regenerate this response"
                      }
                    />
                  }
                >
                  <RefreshCwIcon
                    animateOnHover
                    className={cn(
                      "size-4",
                      isRetrying && "motion-safe:animate-spin-reverse"
                    )}
                    aria-hidden="true"
                  />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isUser ? "Retry from this message" : "Retry this response"}
                </p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="w-auto min-w-60 max-w-[300px]"
            >
              {!isUser && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="pl-0 pr-1">
                      <div className="text-xs font-medium text-muted-foreground px-3 mb-1">
                        Refine response
                      </div>
                      <div className="relative flex items-center">
                        <Input
                          id="refine-input"
                          autoFocus
                          value={refineText}
                          onChange={e => setRefineText(e.target.value)}
                          placeholder="Type a change request…"
                          className="h-6 w-full border-none px-3 font-normal text-foreground placeholder:text-muted-foreground shadow-none outline-none focus:ring-0 focus-visible:ring-0"
                          onKeyDown={e => {
                            if (
                              e.key === "Enter" &&
                              refineText.trim().length > 0
                            ) {
                              handleRefine("custom", refineText.trim());
                              setRefineText("");
                              setOpen(false);
                              onDropdownOpenChange?.(false);
                            }
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              const firstAction =
                                document.getElementById("add-details-action");
                              (firstAction as HTMLElement | null)?.focus();
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 rounded-full p-0 shrink-0"
                          aria-label="Submit instruction"
                          title="Submit"
                          onClick={() => {
                            if (refineText.trim().length === 0) {
                              return;
                            }
                            handleRefine("custom", refineText.trim());
                            setRefineText("");
                            setOpen(false);
                            onDropdownOpenChange?.(false);
                          }}
                        >
                          <ArrowUpIcon className="size-2" />
                        </Button>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="my-1" />

                  <DropdownMenuItem
                    id="add-details-action"
                    onClick={() => handleRefine("add_details")}
                    onKeyDown={e => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const inputEl = document.getElementById("refine-input");
                        (inputEl as HTMLElement | null)?.focus();
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <ArrowsOutSimpleIcon className="size-4" />
                    Add more detail
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRefine("more_concise")}
                    className="flex items-center gap-2"
                  >
                    <ArrowsInSimpleIcon className="size-4" />
                    Make more concise
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Retry
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuItem
                onClick={handleRetrySame}
                className="flex items-center gap-2"
              >
                <ArrowCounterClockwiseIcon className="size-4" />
                Retry with current model
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {renderModelList()}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile: Drawer */}
        <div className="sm:hidden">
          <Drawer
            open={isMobileSheetOpen}
            onOpenChange={handleMobileSheetOpenChange}
          >
            <Tooltip>
              <DrawerTrigger asChild>
                <TooltipTrigger
                  render={
                    <ActionButton
                      disabled={isEditing || isRetrying || isStreaming}
                      title={
                        isUser
                          ? "Retry from this message"
                          : "Retry this response"
                      }
                      aria-label={
                        isUser
                          ? "Retry conversation from this message"
                          : "Regenerate this response"
                      }
                    />
                  }
                >
                  <RefreshCwIcon
                    animateOnHover
                    className={cn(
                      "size-4",
                      isRetrying && "motion-safe:animate-spin-reverse"
                    )}
                    aria-hidden="true"
                  />
                </TooltipTrigger>
              </DrawerTrigger>
              <TooltipContent>
                <p>
                  {isUser ? "Retry from this message" : "Retry this response"}
                </p>
              </TooltipContent>
            </Tooltip>

            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>
                  {isUser ? "Retry from this message" : "Retry this response"}
                </DrawerTitle>
              </DrawerHeader>
              <DrawerBody>
                <div className="flex flex-col">
                  {!isUser && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground px-2 py-2">
                        Refine response
                      </div>
                      <DrawerItem
                        icon={<NotePencilIcon className={DRAWER_ICON_SIZE} />}
                        onClick={() => {
                          setIsMobileSheetOpen(false);
                          setRefineText("");
                          setIsRefineDialogOpen(true);
                        }}
                      >
                        Edit instruction…
                      </DrawerItem>
                      <DrawerItem
                        icon={
                          <ArrowsOutSimpleIcon className={DRAWER_ICON_SIZE} />
                        }
                        onClick={() => handleRefine("add_details")}
                      >
                        Add more detail
                      </DrawerItem>
                      <DrawerItem
                        icon={
                          <ArrowsInSimpleIcon className={DRAWER_ICON_SIZE} />
                        }
                        onClick={() => handleRefine("more_concise")}
                      >
                        Make more concise
                      </DrawerItem>
                    </>
                  )}
                  <div className="text-xs font-medium text-muted-foreground px-2 py-2">
                    Retry
                  </div>
                  <DrawerItem
                    icon={
                      <ArrowCounterClockwiseIcon className={DRAWER_ICON_SIZE} />
                    }
                    onClick={handleRetrySame}
                  >
                    Retry with current model
                  </DrawerItem>
                </div>
                {renderModelListMobile()}
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        </div>

        {/* Refine dialog (shared) */}
        <Dialog open={isRefineDialogOpen} onOpenChange={setIsRefineDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>How should I change the response?</DialogTitle>
            </DialogHeader>
            <div className="stack-md">
              <Input
                value={refineText}
                onChange={e => setRefineText(e.target.value)}
                placeholder="e.g., Use bullet points and clarify step 3"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRefineDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (refineText.trim().length === 0) {
                      setIsRefineDialogOpen(false);
                      return;
                    }
                    handleRefine("custom", refineText.trim());
                    setIsRefineDialogOpen(false);
                  }}
                >
                  Apply and retry
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

RetryDropdown.displayName = "RetryDropdown";
