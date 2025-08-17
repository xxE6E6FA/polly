import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
// import { useAuthToken } from "@convex-dev/auth/react";
import {
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  HeartIcon,
  NotePencilIcon,
  SpeakerHighIcon,
  Square,
  TrashIcon,
} from "@phosphor-icons/react";
import { PROVIDER_CONFIG } from "@shared/provider-constants";
import { useAction, useMutation, useQuery } from "convex/react";
import type React from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useModelSelection } from "@/lib/chat/use-model-selection";
import { CACHE_KEYS, set } from "@/lib/local-storage";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";

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
  }: RetryDropdownProps) => {
    const [open, setOpen] = useState(false);
    const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
    const [isRefineDialogOpen, setIsRefineDialogOpen] = useState(false);
    const [refineText, setRefineText] = useState("");
    // no local ref needed; we move focus via element id
    const { modelGroups, userModels } = useModelSelection();
    const selectModelMutation = useMutation(api.userModels.selectModel);
    const managedToast = useToast();

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
        if (modelId && provider) {
          const selectedModelData = userModels.find(
            (model: AvailableModel | null) =>
              model?.modelId === modelId && model?.provider === provider
          );

          if (selectedModelData) {
            set(CACHE_KEYS.selectedModel, selectedModelData);
          }

          try {
            await selectModelMutation({ modelId, provider });
          } catch (_error) {
            managedToast.error("Failed to select model", {
              description:
                "Unable to change the selected model. Please try again.",
            });
          }
        }

        onRetry(modelId, provider);
      },
      [
        selectModelMutation,
        userModels,
        onRetry,
        onDropdownOpenChange,
        managedToast.error,
      ]
    );

    const handleRetrySame = () => {
      setOpen(false);
      setIsMobileSheetOpen(false);
      onDropdownOpenChange?.(false);
      onRetry();
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

    const renderModelList = () => (
      <>
        <button
          onClick={handleRetrySame}
          className="flex items-center gap-2 w-full p-3 border-b hover:bg-muted/50 transition-colors"
        >
          <ArrowCounterClockwiseIcon className="h-4 w-4" />
          <span className="font-medium">Retry same</span>
        </button>
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Free Models Group */}
          {modelGroups.freeModels.length > 0 && (
            <div className="border-b">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
                <ProviderIcon provider="polly" className="h-4 w-4" />
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
                    className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{model.name}</span>
                      {model.free && (
                        <span className="text-xs text-muted-foreground bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Free
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {capabilities.length > 0 &&
                        capabilities.slice(0, 3).map((capability, index) => {
                          const IconComponent = capability.icon;
                          return (
                            <TooltipWrapper
                              key={`${model.modelId}-${capability.label}-${index}`}
                              content={
                                <div>
                                  <div className="font-semibold text-foreground">
                                    {capability.label}
                                  </div>
                                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {capability.description}
                                  </div>
                                </div>
                              }
                            >
                              <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-md bg-muted/50 transition-all duration-200 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50">
                                <IconComponent className="h-3 w-3" />
                              </div>
                            </TooltipWrapper>
                          );
                        })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Provider Groups */}
          {Object.entries(modelGroups.providerModels).map(
            ([providerId, models]) => {
              const providerConfig =
                PROVIDER_CONFIG[providerId as keyof typeof PROVIDER_CONFIG];
              const providerTitle = providerConfig?.title || providerId;

              return (
                <div key={providerId} className="border-b last:border-b-0">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
                    <ProviderIcon provider={providerId} className="h-4 w-4" />
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
                        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate">{model.name}</span>
                          {model.free && (
                            <span className="text-xs text-muted-foreground bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Free
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {capabilities.length > 0 &&
                            capabilities
                              .slice(0, 3)
                              .map((capability, index) => {
                                const IconComponent = capability.icon;
                                return (
                                  <TooltipWrapper
                                    key={`${model.modelId}-${capability.label}-${index}`}
                                    content={
                                      <div>
                                        <div className="font-semibold text-foreground">
                                          {capability.label}
                                        </div>
                                        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                          {capability.description}
                                        </div>
                                      </div>
                                    }
                                  >
                                    <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-md bg-muted/50 transition-all duration-200 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50">
                                      <IconComponent className="h-3 w-3" />
                                    </div>
                                  </TooltipWrapper>
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

    return (
      <>
        {/* Desktop: Dropdown */}
        <div className="hidden sm:block">
          <DropdownMenu open={open} onOpenChange={handleOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
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
              className="w-auto min-w-[240px] max-w-[300px]"
            >
              {!isUser && (
                <>
                  <DropdownMenuLabel className="pl-0 pr-1">
                    <div className="relative flex items-center">
                      <Input
                        id="refine-input"
                        autoFocus
                        value={refineText}
                        onChange={e => setRefineText(e.target.value)}
                        placeholder="Ask to change response"
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
                    Add details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRefine("more_concise")}
                    className="flex items-center gap-2"
                  >
                    <ArrowsInSimpleIcon className="h-4 w-4" />
                    More concise
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={handleRetrySame}
                className="flex items-center gap-2"
              >
                <ArrowCounterClockwiseIcon className="h-4 w-4" />
                Retry same
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Free Models Group */}
              {modelGroups.freeModels.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                    <ProviderIcon provider="polly" className="h-4 w-4" />
                    Polly
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-auto min-w-[200px]">
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
                          onClick={() =>
                            handleRetry(model.modelId, model.provider)
                          }
                          className="flex items-center justify-between"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate">{model.name}</span>
                            {model.free && (
                              <span className="text-xs text-muted-foreground bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                Free
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1 ml-2">
                            {capabilities.length > 0 &&
                              capabilities.slice(0, 2).map(capability => {
                                const IconComponent = capability.icon;
                                return (
                                  <TooltipWrapper
                                    key={capability.label}
                                    content={capability.description}
                                  >
                                    <div className="flex items-center justify-center w-4 h-4">
                                      <IconComponent className="w-3 h-3 text-muted-foreground" />
                                    </div>
                                  </TooltipWrapper>
                                );
                              })}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Provider Groups */}
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
                          className="h-4 w-4"
                        />
                        {providerTitle}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-auto min-w-[200px]">
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
                              className="flex items-center justify-between gap-2"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="truncate">{model.name}</span>
                                {model.free && (
                                  <span className="text-xs text-muted-foreground">
                                    Free
                                  </span>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {capabilities.length > 0 &&
                                  capabilities
                                    .slice(0, 3)
                                    .map((capability, index) => {
                                      const IconComponent = capability.icon;
                                      return (
                                        <TooltipWrapper
                                          key={`${model.modelId}-${capability.label}-${index}`}
                                          content={
                                            <div>
                                              <div className="font-semibold text-foreground">
                                                {capability.label}
                                              </div>
                                              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                {capability.description}
                                              </div>
                                            </div>
                                          }
                                        >
                                          <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-md bg-muted/50 transition-all duration-200 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50">
                                            <IconComponent className="h-3 w-3" />
                                          </div>
                                        </TooltipWrapper>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile: Bottom Sheet */}
        <div className="sm:hidden">
          <Tooltip>
            <TooltipTrigger asChild>
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
                onClick={() => setIsMobileSheetOpen(true)}
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
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isUser ? "Retry from this message" : "Retry this response"}
              </p>
            </TooltipContent>
          </Tooltip>

          <Dialog
            open={isMobileSheetOpen}
            onOpenChange={handleMobileSheetOpenChange}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {isUser ? "Retry from this message" : "Retry this response"}
                </DialogTitle>
              </DialogHeader>
              {/* Refinement options for mobile */}
              <div className="flex flex-col">
                <button
                  onClick={() => {
                    setIsMobileSheetOpen(false);
                    setRefineText("");
                    setIsRefineDialogOpen(true);
                  }}
                  className="flex items-center gap-2 w-full p-3 border-b hover:bg-muted/50 transition-colors"
                >
                  Ask to change response
                </button>
                <button
                  onClick={() => handleRefine("add_details")}
                  className="flex items-center gap-2 w-full p-3 border-b hover:bg-muted/50 transition-colors"
                >
                  Add details
                </button>
                <button
                  onClick={() => handleRefine("more_concise")}
                  className="flex items-center gap-2 w-full p-3 border-b hover:bg-muted/50 transition-colors"
                >
                  More concise
                </button>
              </div>
              {renderModelList()}
            </DialogContent>
          </Dialog>
        </div>

        {/* Refine dialog (shared) */}
        <Dialog open={isRefineDialogOpen} onOpenChange={setIsRefineDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>How should I change the response?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
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
        <TooltipTrigger asChild>
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

type MessageActionsProps = {
  isUser: boolean;
  isStreaming: boolean;
  isEditing?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  messageId?: string;
  copyToClipboard: () => void;
  onEditMessage?: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: () => void;
  model?: string;
  provider?: string;
  className?: string;
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
    copyToClipboard,
    onEditMessage,
    onRetryMessage,
    onRefineMessage,
    onDeleteMessage,
    model,
    provider,
    className,
  }: MessageActionsProps) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { isPrivateMode } = usePrivateMode();
    const managedToast = useToast();

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
      !isPrivateMode && messageId && !messageId.startsWith("private-")
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

    // Server-side streaming is now the canonical path for TTS

    // Cleanup audio and abort controller on component unmount
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
      isDropdownOpen && "sm:opacity-100 sm:translate-y-0",
      className
    );

    return (
      <div className={containerClassName}>
        <div className="flex items-center gap-1">
          {!isPrivateMode && messageId && !messageId.startsWith("private-") && (
            <ActionButton
              disabled={isEditing}
              tooltip={isFavorited ? "Unfavorite" : "Favorite"}
              ariaLabel={
                isFavorited ? "Remove from favorites" : "Add to favorites"
              }
              icon={
                isFavorited ? (
                  <HeartIcon
                    className="h-3.5 w-3.5 text-destructive"
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : (
                  <HeartIcon className="h-3.5 w-3.5" aria-hidden="true" />
                )
              }
              onClick={handleToggleFavorite}
            />
          )}
          {!isUser && messageId && (
            <ActionButton
              disabled={isEditing}
              tooltip={
                ttsState === "loading"
                  ? "Cancel generation"
                  : ttsState === "playing"
                    ? "Stop audio"
                    : "Listen"
              }
              ariaLabel={
                ttsState === "loading"
                  ? "Cancel TTS generation"
                  : ttsState === "playing"
                    ? "Stop audio playback"
                    : "Listen to assistant response"
              }
              icon={
                ttsState === "loading" ? (
                  <Spinner size="sm" className="h-3.5 w-3.5" />
                ) : ttsState === "playing" ? (
                  <Square
                    className="h-3.5 w-3.5 text-red-500"
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : (
                  <SpeakerHighIcon className="h-3.5 w-3.5" aria-hidden="true" />
                )
              }
              onClick={handleTTS}
              className={
                ttsState === "playing"
                  ? "hover:bg-red-50 dark:hover:bg-red-950/20"
                  : undefined
              }
            />
          )}
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

          {onEditMessage && (
            <ActionButton
              disabled={isEditing}
              icon={
                <NotePencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
              }
              tooltip="Edit message"
              ariaLabel="Edit this message"
              onClick={onEditMessage}
            />
          )}

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
        </div>

        {!isUser &&
          (model && provider === "openrouter" ? (
            <a
              className="text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
              href={`https://openrouter.ai/${model}`}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={`View ${model} model details on OpenRouter`}
            >
              {model}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/70">
              {model || "Assistant"}
            </span>
          ))}
      </div>
    );
  }
);

MessageActions.displayName = "MessageActions";
