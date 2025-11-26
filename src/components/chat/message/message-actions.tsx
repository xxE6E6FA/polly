import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  ChartBarIcon,
  CheckIcon,
  CopyIcon,
  DotsThreeIcon,
  GitBranchIcon,
  HeartIcon,
  NotePencilIcon,
  SpeakerHighIcon,
  SquareIcon,
  TextAaIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { PROVIDER_CONFIG } from "@shared/provider-constants";
import { useAction, useMutation, useQuery } from "convex/react";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useModelCatalog, useModelTitle } from "@/hooks/use-model-catalog";
import { useSelectModel } from "@/hooks/use-select-model";
import { useUserSettings } from "@/hooks/use-user-settings";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import type { WebSearchCitation } from "@/types";
import { CitationAvatarStack } from "../citation-avatar-stack";

// Union type for models from getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

type RetryDropdownProps = {
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

const RetryDropdown = memo(
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
    const { selectModel } = useSelectModel();

    const normalizedProvider = currentProvider?.toLowerCase();
    const isImageProvider = normalizedProvider === "replicate";

    const imageModelOptions = useMemo(() => {
      if (!enabledImageModels) {
        return [] as Doc<"userImageModels">[];
      }
      return [...enabledImageModels].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
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
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
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
                                  <IconComponent className="h-3 w-3" />
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
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
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
                                        <IconComponent className="h-3 w-3" />
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
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
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
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
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
                              <IconComponent className="h-3 w-3" />
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
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
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
                                    <IconComponent className="h-3 w-3" />
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
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
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
                <DropdownMenuTrigger>
                  <Button
                    className={cn(
                      "btn-action h-7 w-7 transition-all duration-200 ease-out",
                      "motion-safe:hover:scale-105",
                      "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms }"
                    )}
                    disabled={isEditing || isRetrying || isStreaming}
                    size="sm"
                    title={
                      isUser ? "Retry from this message" : "Retry this response"
                    }
                    variant="ghost"
                    aria-label={
                      isUser
                        ? "Retry conversation from this message"
                        : "Regenerate this response"
                    }
                  >
                    <ArrowCounterClockwiseIcon
                      className={cn(
                        "h-3.5 w-3.5",
                        isRetrying && "motion-safe:animate-spin-reverse",
                        "@media (prefers-reduced-motion: reduce) { animation: none }"
                      )}
                      aria-hidden="true"
                    />
                  </Button>
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
                          <ArrowUpIcon className="h-2 w-2" />
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
                    <ArrowsOutSimpleIcon className="h-4 w-4" />
                    Add more detail
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRefine("more_concise")}
                    className="flex items-center gap-2"
                  >
                    <ArrowsInSimpleIcon className="h-4 w-4" />
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
                <ArrowCounterClockwiseIcon className="h-4 w-4" />
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
              <TooltipTrigger>
                <DrawerTrigger>
                  <Button
                    className={cn(
                      "btn-action h-7 w-7 transition-all duration-200 ease-out",
                      "motion-safe:hover:scale-105",
                      "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms }"
                    )}
                    disabled={isEditing || isRetrying || isStreaming}
                    size="sm"
                    title={
                      isUser ? "Retry from this message" : "Retry this response"
                    }
                    variant="ghost"
                    aria-label={
                      isUser
                        ? "Retry conversation from this message"
                        : "Regenerate this response"
                    }
                  >
                    <ArrowCounterClockwiseIcon
                      className={cn(
                        "h-3.5 w-3.5",
                        isRetrying && "motion-safe:animate-spin-reverse",
                        "@media (prefers-reduced-motion: reduce) { animation: none }"
                      )}
                      aria-hidden="true"
                    />
                  </Button>
                </DrawerTrigger>
              </TooltipTrigger>
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
                      <button
                        onClick={() => {
                          setIsMobileSheetOpen(false);
                          setRefineText("");
                          setIsRefineDialogOpen(true);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
                      >
                        <NotePencilIcon className="h-4 w-4" />
                        Edit instruction…
                      </button>
                      <button
                        onClick={() => handleRefine("add_details")}
                        className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
                      >
                        <ArrowsOutSimpleIcon className="h-4 w-4" />
                        Add more detail
                      </button>
                      <button
                        onClick={() => handleRefine("more_concise")}
                        className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
                      >
                        <ArrowsInSimpleIcon className="h-4 w-4" />
                        Make more concise
                      </button>
                    </>
                  )}
                  <div className="text-xs font-medium text-muted-foreground px-2 py-2">
                    Retry
                  </div>
                  <button
                    onClick={handleRetrySame}
                    className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    <ArrowCounterClockwiseIcon className="h-4 w-4" />
                    Retry with current model
                  </button>
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

type ActionButtonProps = {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
};

const ActionButton = memo(
  ({
    icon,
    tooltip,
    onClick,
    disabled,
    title,
    className,
    ariaLabel,
  }: ActionButtonProps) => {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Button
            className={cn(
              "btn-action h-7 w-7 transition-all duration-200 ease-out",
              "motion-safe:hover:scale-105",
              "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms }",
              className
            )}
            disabled={disabled}
            size="sm"
            title={title}
            variant="ghost"
            aria-label={ariaLabel || tooltip}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
);

ActionButton.displayName = "ActionButton";

type TtsState = "idle" | "loading" | "playing";

function getTTSTooltip(ttsState: TtsState): string {
  if (ttsState === "loading") {
    return "Cancel generation";
  }
  if (ttsState === "playing") {
    return "Stop audio";
  }
  return "Listen";
}

function getTTSIconForDropdown(ttsState: TtsState): React.ReactNode {
  if (ttsState === "loading") {
    return <Spinner size="sm" className="h-4 w-4 mr-2" />;
  }
  if (ttsState === "playing") {
    return <SquareIcon className="h-4 w-4 mr-2 text-red-500" weight="fill" />;
  }
  return <SpeakerHighIcon className="h-4 w-4 mr-2" />;
}

function getTTSIconForButton(ttsState: TtsState): React.ReactNode {
  if (ttsState === "loading") {
    return <Spinner size="sm" className="h-3.5 w-3.5" />;
  }
  if (ttsState === "playing") {
    return <SquareIcon className="h-3.5 w-3.5 text-red-500" weight="fill" />;
  }
  return <SpeakerHighIcon className="h-3.5 w-3.5" />;
}

type MessageActionsProps = {
  isUser: boolean;
  isStreaming: boolean;
  isEditing?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  messageId?: string;
  conversationId?: string;
  copyToClipboard: () => void;
  onEditMessage?: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: () => void;
  onOpenZenMode?: () => void;
  model?: string;
  provider?: string;
  className?: string;
  // When true, keeps actions visible regardless of group hover.
  forceVisible?: boolean;
  // Citations for avatar stack
  citations?: WebSearchCitation[];
  citationsExpanded?: boolean;
  onToggleCitations?: () => void;
};

export const MessageActions = memo(
  ({
    isUser,
    isStreaming,
    isEditing = false,
    isCopied,
    isRetrying,
    isDeleting,
    messageId,
    conversationId,
    copyToClipboard,
    onEditMessage,
    onRetryMessage,
    onRefineMessage,
    onDeleteMessage,
    onOpenZenMode,
    model,
    provider,
    className,
    forceVisible,
    citations,
    citationsExpanded = false,
    onToggleCitations,
    metadata,
  }: MessageActionsProps & {
    metadata?: Doc<"messages">["metadata"];
  }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isOverflowDrawerOpen, setIsOverflowDrawerOpen] = useState(false);
    const { isPrivateMode } = usePrivateMode();
    const managedToast = useToast();
    const navigate = useNavigate();
    const modelTitle = useModelTitle(model, provider);
    const userSettings = useUserSettings();

    const showMetadata =
      userSettings?.showMessageMetadata && metadata?.tokenUsage;
    const tokenUsage = metadata?.tokenUsage;

    const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing">(
      "idle"
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const createTTSStreamUrl = useAction(api.ai.elevenlabs.createTTSStreamUrl);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isCancelledRef = useRef(false);
    const toggleFavorite = useMutation(api.messages.toggleFavorite);
    const isFavorited = useQuery(
      api.messages.isFavorited,
      !isPrivateMode &&
        messageId &&
        !messageId.startsWith("private-") &&
        !messageId.startsWith("user-") &&
        !messageId.startsWith("assistant-")
        ? ({ messageId: messageId as Id<"messages"> } as const)
        : ("skip" as const)
    );

    const handleToggleFavorite = useCallback(async () => {
      if (!messageId || isPrivateMode || messageId.startsWith("private-")) {
        return;
      }
      try {
        const result = await toggleFavorite({
          messageId: messageId as Id<"messages">,
        });
        managedToast.success(
          result.favorited ? "Added to favorites" : "Removed from favorites"
        );
      } catch {
        managedToast.error("Failed to update favorite");
      }
    }, [
      messageId,
      isPrivateMode,
      toggleFavorite,
      managedToast.success,
      managedToast.error,
    ]);

    const handleTTS = useCallback(async () => {
      if (!messageId) {
        return;
      }

      // If currently playing, stop the audio
      if (ttsState === "playing") {
        isCancelledRef.current = true; // Mark as intentionally cancelled
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // Ensure network fetch is aborted by clearing the source
          try {
            audioRef.current.src = "";
            audioRef.current.load();
          } catch {
            // no-op
          }
          audioRef.current = null;
        }
        setTtsState("idle");
        return;
      }

      // If currently loading, cancel the request
      if (ttsState === "loading") {
        isCancelledRef.current = true; // Mark as intentionally cancelled
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setTtsState("idle");
        managedToast.success("TTS generation cancelled");
        return;
      }

      // Stream TTS via server (Convex HTTP endpoint)
      try {
        isCancelledRef.current = false;
        setTtsState("loading");
        // Build signed URL from server
        const urlResult = await createTTSStreamUrl({
          messageId: messageId as Id<"messages">,
          ttlSeconds: 60,
        });

        const audioEl = new Audio();
        audioEl.preload = "auto";
        audioEl.src = urlResult.url;
        audioEl.onended = () => {
          setTtsState("idle");
          audioRef.current = null;
        };
        audioEl.onerror = () => {
          setTtsState("idle");
          audioRef.current = null;
          managedToast.error("Text-to-speech failed");
        };

        audioRef.current = audioEl;
        await audioEl.play();
        setTtsState("playing");
      } catch (error) {
        if (!isCancelledRef.current) {
          const errorMessage =
            error instanceof Error ? error.message : "TTS generation failed";
          managedToast.error(`Text-to-speech failed: ${errorMessage}`);
        }
        setTtsState("idle");
        audioRef.current = null;
        abortControllerRef.current = null;
      }
    }, [messageId, managedToast, ttsState, createTTSStreamUrl]);

    useEffect(() => {
      return () => {
        isCancelledRef.current = true; // Mark as cancelled on unmount
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      };
    }, []);

    if (isStreaming) {
      return null;
    }

    const containerClassName = cn(
      "flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
      "translate-y-0 sm:translate-y-1 sm:group-hover:translate-y-0",
      "transition-all duration-200 ease-out",
      "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms; opacity: 100; transform: none }",
      isUser && isEditing && "opacity-0 pointer-events-none translate-y-2",
      isUser ? "justify-end mt-1.5" : "mt-1.5",
      (isDropdownOpen || forceVisible) && "sm:opacity-100 sm:translate-y-0",
      className
    );

    // Check if we have overflow actions
    const hasOverflowActions =
      (!isPrivateMode && messageId && conversationId) || // Branch action
      (!isPrivateMode && messageId && !messageId.startsWith("private-")) || // Favorite action
      (!isUser && messageId) || // TTS action
      (!isUser && onOpenZenMode) || // Zen mode action
      onEditMessage; // Edit action

    const renderOverflowDrawerItems = () => (
      <>
        {onEditMessage && (
          <button
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              onEditMessage();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
          >
            <NotePencilIcon className="h-4 w-4" />
            Edit message
          </button>
        )}

        {!isPrivateMode && messageId && conversationId && (
          <BranchActionDrawerItem
            conversationId={conversationId}
            messageId={messageId}
            onSuccess={newConversationId => {
              setIsOverflowDrawerOpen(false);
              navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
            }}
          />
        )}

        {!isPrivateMode && messageId && !messageId.startsWith("private-") && (
          <button
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              handleToggleFavorite();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
          >
            <HeartIcon
              className={cn("h-4 w-4", isFavorited && "text-destructive")}
              weight={isFavorited ? "fill" : "regular"}
            />
            {isFavorited ? "Unfavorite" : "Favorite"}
          </button>
        )}

        {!isUser && messageId && (
          <button
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              handleTTS();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
          >
            {getTTSIconForDropdown(ttsState)}
            {getTTSTooltip(ttsState)}
          </button>
        )}

        {!isUser && onOpenZenMode && (
          <button
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              onOpenZenMode();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
          >
            <TextAaIcon className="h-4 w-4" />
            Zen mode
          </button>
        )}
      </>
    );

    return (
      <div className={containerClassName}>
        <div className="flex items-center gap-1">
          {/* Mobile: Overflow drawer */}
          {hasOverflowActions && (
            <div className="sm:hidden">
              <Drawer
                open={isOverflowDrawerOpen}
                onOpenChange={setIsOverflowDrawerOpen}
              >
                <Tooltip>
                  <TooltipTrigger>
                    <DrawerTrigger>
                      <Button
                        className={cn(
                          "btn-action h-7 w-7 transition-all duration-200 ease-out",
                          "motion-safe:hover:scale-105",
                          "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms }"
                        )}
                        disabled={isEditing}
                        size="sm"
                        variant="ghost"
                        aria-label="More actions"
                      >
                        <DotsThreeIcon
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </Button>
                    </DrawerTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>More actions</p>
                  </TooltipContent>
                </Tooltip>

                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>More actions</DrawerTitle>
                  </DrawerHeader>
                  <DrawerBody>
                    <div className="flex flex-col">
                      {renderOverflowDrawerItems()}
                    </div>
                  </DrawerBody>
                </DrawerContent>
              </Drawer>
            </div>
          )}

          {/* Desktop: Individual action buttons */}
          <div className="hidden sm:flex sm:items-center sm:gap-1">
            {onEditMessage && (
              <ActionButton
                disabled={isEditing}
                tooltip="Edit message"
                ariaLabel="Edit this message"
                icon={
                  <NotePencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
                }
                onClick={onEditMessage}
              />
            )}

            {!isPrivateMode && messageId && conversationId && (
              <BranchActionButton
                conversationId={conversationId}
                messageId={messageId}
                isEditing={isEditing}
                onSuccess={newConversationId => {
                  navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
                }}
              />
            )}

            {!isPrivateMode &&
              messageId &&
              !messageId.startsWith("private-") && (
                <ActionButton
                  disabled={isEditing}
                  tooltip={isFavorited ? "Unfavorite" : "Favorite"}
                  ariaLabel={
                    isFavorited ? "Remove from favorites" : "Add to favorites"
                  }
                  icon={
                    <HeartIcon
                      className={cn(
                        "h-3.5 w-3.5",
                        isFavorited && "text-destructive"
                      )}
                      weight={isFavorited ? "fill" : "regular"}
                      aria-hidden="true"
                    />
                  }
                  onClick={handleToggleFavorite}
                />
              )}

            {!isUser && messageId && (
              <ActionButton
                disabled={isEditing}
                tooltip={getTTSTooltip(ttsState)}
                ariaLabel={getTTSTooltip(ttsState)}
                icon={getTTSIconForButton(ttsState)}
                onClick={handleTTS}
              />
            )}

            {!isUser && onOpenZenMode && (
              <ActionButton
                disabled={isEditing}
                tooltip="Zen mode"
                ariaLabel="Open Zen mode"
                icon={<TextAaIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={onOpenZenMode}
              />
            )}
          </div>

          {/* Primary actions: Copy, Retry, Delete */}
          <ActionButton
            disabled={isEditing}
            tooltip="Copy message"
            ariaLabel={
              isCopied
                ? "Message copied to clipboard"
                : "Copy message to clipboard"
            }
            icon={
              isCopied ? (
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )
            }
            onClick={copyToClipboard}
          />

          {onRetryMessage && (
            <RetryDropdown
              isUser={isUser}
              isRetrying={isRetrying}
              isStreaming={isStreaming}
              isEditing={isEditing}
              messageId={messageId}
              onRetry={onRetryMessage}
              onRefine={onRefineMessage}
              onDropdownOpenChange={setIsDropdownOpen}
              currentModel={model}
              currentProvider={provider}
            />
          )}

          {onDeleteMessage && (
            <ActionButton
              className="btn-action-destructive"
              disabled={isEditing || isDeleting || isStreaming}
              icon={<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              title="Delete message"
              tooltip="Delete message"
              ariaLabel="Delete this message permanently"
              onClick={onDeleteMessage}
            />
          )}

          {/* Metadata Display */}
          {showMetadata && tokenUsage && (
            <Popover>
              <PopoverTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1.5 px-2 text-[10px] font-medium text-primary sm:text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/50"
                >
                  {/* Desktop: Show full text */}
                  <span className="hidden sm:inline">
                    {tokenUsage.totalTokens} tokens
                  </span>
                  {metadata?.tokensPerSecond && (
                    <span className="hidden sm:inline">
                      <span className="text-muted-foreground/30">·</span>
                      <span>{Math.round(metadata.tokensPerSecond)} t/s</span>
                    </span>
                  )}
                  {/* Mobile: Show only icon */}
                  <ChartBarIcon
                    className="h-3.5 w-3.5 sm:hidden"
                    aria-hidden="true"
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start" side="top">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-semibold">
                      Generation Stats
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {metadata?.providerMessageId?.slice(0, 8)}
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        Input Tokens
                      </span>
                      <span className="font-mono">
                        {tokenUsage.inputTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        Output Tokens
                      </span>
                      <span className="font-mono">
                        {tokenUsage.outputTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 mt-1 font-medium">
                      <span>Total Tokens</span>
                      <span className="font-mono">
                        {tokenUsage.totalTokens.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {(metadata?.timeToFirstTokenMs ||
                    metadata?.tokensPerSecond) && (
                    <div className="grid gap-2 text-xs border-t pt-2">
                      {metadata.timeToFirstTokenMs && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Time to First Token
                          </span>
                          <span className="font-mono">
                            {metadata.timeToFirstTokenMs}ms
                          </span>
                        </div>
                      )}
                      {metadata.tokensPerSecond && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Generation Speed
                          </span>
                          <span className="font-mono">
                            {metadata.tokensPerSecond.toFixed(1)} t/s
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Citations avatar stack */}
          {!isUser &&
            citations &&
            citations.length > 0 &&
            onToggleCitations && (
              <CitationAvatarStack
                citations={citations}
                isExpanded={citationsExpanded}
                onToggle={onToggleCitations}
              />
            )}
        </div>

        {!isUser && model && provider && (
          <Badge variant="outline" size="sm" className="text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {provider !== "replicate" && (
                <ProviderIcon className="h-3 w-3" provider={provider} />
              )}
              <span className="hidden sm:inline">{modelTitle}</span>
            </div>
          </Badge>
        )}
      </div>
    );
  }
);

MessageActions.displayName = "MessageActions";

function BranchActionButton({
  conversationId,
  messageId,
  isEditing,
  onSuccess,
}: {
  conversationId: string;
  messageId: string;
  isEditing?: boolean;
  onSuccess: (newConversationId: string, assistantMessageId?: string) => void;
}) {
  const createBranch = useAction(api.branches.createBranch);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const managedToast = useToast();
  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const res = await createBranch({
        conversationId: conversationId as Id<"conversations">,
        messageId: messageId as Id<"messages">,
      });
      // Server-side streaming is now handled automatically by the Convex action
      onSuccess(res.conversationId, res.assistantMessageId);
      managedToast.success("Branched conversation");
    } catch (_e) {
      managedToast.error("Failed to create branch");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <ActionButton
        disabled={isEditing}
        tooltip="Branch from here"
        ariaLabel="Create a new conversation branch from this point"
        icon={<GitBranchIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will create a new conversation with all messages up to this
            point. Continue in the new branch afterwards.
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={loading} onClick={handleConfirm}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" variant="primary" />
                  <span>Creating…</span>
                </span>
              ) : (
                "Create branch"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BranchActionDrawerItem({
  conversationId,
  messageId,
  onSuccess,
}: {
  conversationId: string;
  messageId: string;
  onSuccess: (newConversationId: string, assistantMessageId?: string) => void;
}) {
  const createBranch = useAction(api.branches.createBranch);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const managedToast = useToast();
  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const res = await createBranch({
        conversationId: conversationId as Id<"conversations">,
        messageId: messageId as Id<"messages">,
      });
      onSuccess(res.conversationId, res.assistantMessageId);
      managedToast.success("Branched conversation");
    } catch (_e) {
      managedToast.error("Failed to create branch");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2.5 border-b border-border/30 hover:bg-muted/50 transition-colors text-left"
      >
        <GitBranchIcon className="h-4 w-4" />
        Branch from here
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will create a new conversation with all messages up to this
            point. Continue in the new branch afterwards.
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={loading} onClick={handleConfirm}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" variant="primary" />
                  <span>Creating…</span>
                </span>
              ) : (
                "Create branch"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
