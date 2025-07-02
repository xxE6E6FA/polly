import { memo, useCallback, useMemo, useState } from "react";

import { useNavigate } from "react-router";

import { useAuthToken } from "@convex-dev/auth/react";
import {
  CaretDownIcon,
  ChatCircleIcon,
  KeyIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";

import { ProviderIcon } from "@/components/provider-icons";
import { Backdrop } from "@/components/ui/backdrop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useUser } from "@/hooks/use-user";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type AIModel } from "@/types";

import { api } from "../../convex/_generated/api";

// Provider mapping with titles and icons
const PROVIDER_CONFIG = {
  openai: { title: "OpenAI", icon: "openai" },
  anthropic: { title: "Anthropic", icon: "anthropic" },
  google: { title: "Google AI", icon: "google" },
  openrouter: { title: "OpenRouter", icon: "openrouter" },
  polly: { title: "Polly", icon: "polly" },
} as const;

// Polly icon component using the favicon
const PollyIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M16 7h.01" />
    <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
    <path d="m20 7 2 .5-2 .5" />
    <path d="M10 18v3" />
    <path d="M14 17.75V21" />
    <path d="M7 18a6 6 0 0 0 3.84-10.61" />
  </svg>
);

// Enhanced ProviderIcon component that handles Polly and standardizes sizing
const EnhancedProviderIcon = ({ provider }: { provider: string }) => {
  if (provider === "polly") {
    return <PollyIcon />;
  }
  return (
    <div className="flex h-4 w-4 items-center justify-center">
      <ProviderIcon provider={provider} />
    </div>
  );
};

// Memoized model item component
const ModelItem = memo(
  ({
    model,
    onSelect,
    hasReachedPollyLimit,
  }: {
    model: AIModel;
    onSelect: (value: string) => void;
    hasReachedPollyLimit?: boolean;
  }) => {
    const capabilities = useMemo(() => getModelCapabilities(model), [model]);

    const handleSelect = useCallback(() => {
      // Don't allow selecting Polly models if limit is reached
      if (model.free && hasReachedPollyLimit) {
        return;
      }
      onSelect(model.modelId);
    }, [model.modelId, model.free, hasReachedPollyLimit, onSelect]);

    // Check if this is a disabled Polly model
    const isPollyDisabled = model.free && hasReachedPollyLimit;

    const modelItem = (
      <CommandItem
        key={model.modelId}
        className={cn(
          "min-h-[44px] cursor-pointer px-4 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-accent/30 sm:min-h-0 sm:px-3 sm:py-2.5",
          isPollyDisabled &&
            "cursor-not-allowed opacity-60 hover:bg-transparent"
        )}
        value={`${model.name} ${model.provider} ${model.modelId}`}
        onSelect={handleSelect}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {model.free && !isPollyDisabled && (
              <Badge
                className="h-5 shrink-0 border-success-border bg-success-bg px-1.5 py-0 text-[10px] text-success"
                variant="secondary"
              >
                Free
              </Badge>
            )}
            {isPollyDisabled && (
              <Badge
                className="h-5 shrink-0 border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400"
                variant="secondary"
              >
                Limit Reached
              </Badge>
            )}
            <span className={cn("font-medium text-sm truncate")}>
              {model.name}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {capabilities.length > 0 &&
              capabilities.slice(0, 4).map((capability, index) => {
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
                    <div className="flex h-6 w-6 cursor-help items-center justify-center rounded-md bg-muted/50 transition-all duration-200 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50">
                      <IconComponent className="h-3.5 w-3.5" />
                    </div>
                  </TooltipWrapper>
                );
              })}
          </div>
        </div>
      </CommandItem>
    );

    if (isPollyDisabled) {
      return (
        <TooltipWrapper
          content={
            <div>
              <div className="font-semibold text-foreground">
                Monthly Limit Reached
              </div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                You've used all {MONTHLY_MESSAGE_LIMIT} free messages this
                month. Switch to BYOK models for unlimited usage.
              </div>
            </div>
          }
        >
          {modelItem}
        </TooltipWrapper>
      );
    }

    return modelItem;
  }
);

ModelItem.displayName = "ModelItem";

type ModelPickerProps = {
  className?: string;
};

const ModelPickerComponent = ({ className }: ModelPickerProps) => {
  const [open, setOpen] = useState(false);
  const token = useAuthToken();
  const navigate = useNavigate();
  const { user, monthlyUsage, hasUnlimitedCalls } = useUser();

  const userModelsByProvider = useQuery(api.userModels.getUserModelsByProvider);
  const selectedModel = useSelectedModel();
  const hasEnabledModels = useQuery(api.userModels.hasUserModels);
  const selectModelMutation = useMutation(api.userModels.selectModel);

  // Check if user is authenticated
  const isAuthenticated = Boolean(token);

  // Check if user has reached Polly model limit
  const hasReachedPollyLimit = useMemo(() => {
    return (
      user &&
      !user.isAnonymous &&
      monthlyUsage &&
      monthlyUsage.remainingMessages === 0 &&
      !hasUnlimitedCalls
    );
  }, [user, monthlyUsage, hasUnlimitedCalls]);

  // Display name getter
  const displayName = useMemo(() => {
    if (!isAuthenticated) {
      return "Gemini 2.5 Flash Lite";
    }

    return selectedModel?.name || "Select model";
  }, [selectedModel, isAuthenticated]);

  // Handle model selection
  const handleSelect = useCallback(
    (modelId: string) => {
      selectModelMutation({ modelId });
      setOpen(false);
    },
    [selectModelMutation]
  );

  // Show loading state - only if both selectedModel and hasEnabledModels are still loading
  if (
    !selectedModel &&
    !userModelsByProvider &&
    hasEnabledModels === undefined &&
    isAuthenticated
  ) {
    return (
      <Button
        disabled
        variant="ghost"
        className={cn(
          "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/60 group disabled:opacity-60",
          className
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="font-medium">Loading models...</span>
          <CaretDownIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        </div>
      </Button>
    );
  }

  // Anonymous user case - show default model but allow opening for upsell
  if (!isAuthenticated) {
    return (
      <>
        {/* Backdrop blur overlay */}
        {open && (
          <Backdrop
            blur="sm"
            className="z-40 duration-200 animate-in fade-in-0"
            variant="default"
          />
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-expanded={open}
              role="combobox"
              variant="ghost"
              className={cn(
                "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground group relative picker-trigger",
                "hover:bg-accent/50 dark:hover:bg-accent/30",
                "transition-all duration-200",
                open && "bg-accent/50 dark:bg-accent/30 text-foreground",
                className
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="max-w-[150px] truncate font-medium">
                  {displayName}
                </span>
                <CaretDownIcon
                  className={cn(
                    "h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200 shrink-0",
                    open && "rotate-180 text-foreground"
                  )}
                />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            avoidCollisions
            className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-lg data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 dark:shadow-xl dark:shadow-black/20"
            collisionPadding={16}
            side="top"
            sideOffset={4}
          >
            <div className="relative p-6">
              <h3 className="mb-2 text-center text-base font-semibold text-foreground">
                Sign in for more features!
              </h3>

              <div className="mb-6 space-y-3">
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
                    <div className="font-medium text-foreground">
                      Advanced features
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Custom personas, conversation sharing, and more!
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA button - using standard button styles */}
              <Button
                className="w-full"
                size="sm"
                variant="default"
                onClick={e => {
                  // Prevent opening model picker
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(ROUTES.AUTH);
                }}
              >
                Sign In
              </Button>

              {/* Footer text */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Free to use • No credit card required
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </>
    );
  }

  // Show initial setup message if no models are stored (signed-in users)
  if (userModelsByProvider?.length === 0) {
    return (
      <TooltipWrapper
        content="Go to Settings → Models to load available models"
        open
      >
        <Button
          disabled
          variant="ghost"
          className={cn(
            "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/60 group disabled:opacity-60",
            className
          )}
        >
          <div className="flex items-center gap-1.5">
            <WarningIcon className="h-3.5 w-3.5 text-warning/50" />
            <span className="font-medium">Configure models</span>
            <CaretDownIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
          </div>
        </Button>
      </TooltipWrapper>
    );
  }

  return (
    <>
      {/* Backdrop blur overlay */}
      {open && (
        <Backdrop
          blur="sm"
          className="z-40 duration-200 animate-in fade-in-0"
          variant="default"
        />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            role="combobox"
            variant="ghost"
            className={cn(
              "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground group relative picker-trigger",
              "hover:bg-accent/50 dark:hover:bg-accent/30",
              "transition-all duration-200",
              open && "bg-accent/50 dark:bg-accent/30 text-foreground",
              className
            )}
          >
            <div className="flex items-center gap-1.5">
              {selectedModel?.free && !hasReachedPollyLimit && (
                <Badge
                  className="h-4 border-success/20 bg-success/10 px-1.5 py-0 text-[10px] text-success hover:bg-success/10"
                  variant="secondary"
                >
                  Free
                </Badge>
              )}
              {selectedModel?.free && hasReachedPollyLimit && (
                <Badge
                  className="h-4 border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400"
                  variant="secondary"
                >
                  Limit
                </Badge>
              )}
              <span className="max-w-[150px] truncate font-medium">
                {displayName}
              </span>
              <CaretDownIcon
                className={cn(
                  "h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200 shrink-0",
                  open && "rotate-180 text-foreground"
                )}
              />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          avoidCollisions
          className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-lg data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 dark:shadow-xl dark:shadow-black/20"
          collisionPadding={16}
          side="top"
          sideOffset={4}
        >
          <Command className="pt-2">
            <CommandInput className="h-9" placeholder="Search models..." />
            <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
              <CommandEmpty>
                <div className="p-4 text-center">
                  <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="mb-1 text-sm text-muted-foreground">
                    No models found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search terms
                  </p>
                </div>
              </CommandEmpty>

              {userModelsByProvider?.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="mb-2 text-sm text-muted-foreground">
                    No models available
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add API keys and configure models in Settings
                  </p>
                </div>
              ) : (
                userModelsByProvider?.map((provider, providerIndex) => {
                  const providerConfig =
                    PROVIDER_CONFIG[
                      provider.id as keyof typeof PROVIDER_CONFIG
                    ];
                  const providerTitle = providerConfig?.title || provider.name;
                  const providerIcon = providerConfig?.icon || provider.id;

                  return (
                    <CommandGroup key={provider.id}>
                      <div className="flex items-center gap-2 px-2 py-1.5 opacity-75">
                        <EnhancedProviderIcon provider={providerIcon} />
                        <span className="text-xs font-medium text-muted-foreground">
                          {providerTitle}
                        </span>
                      </div>
                      {provider.models.map(model => (
                        <ModelItem
                          key={model.modelId}
                          model={model}
                          onSelect={handleSelect}
                          hasReachedPollyLimit={hasReachedPollyLimit ?? false}
                        />
                      ))}
                      {providerIndex < userModelsByProvider.length - 1 && (
                        <div className="mx-2 my-1.5 h-px bg-border/50" />
                      )}
                    </CommandGroup>
                  );
                }) || []
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
};

export const ModelPicker = memo(ModelPickerComponent);
