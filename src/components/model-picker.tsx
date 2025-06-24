import { useMemo, useState, useCallback, memo } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Search,
  AlertCircle,
  ChevronDown,
  MessageSquare,
  Key,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router";

import { AIModel } from "@/types";
import { cn } from "@/lib/utils";
import {
  getModelCapabilities,
  getCapabilityColor,
} from "@/lib/model-capabilities";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { ProviderIcon } from "@/components/provider-icons";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";

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
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M16 7h.01"></path>
    <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"></path>
    <path d="m20 7 2 .5-2 .5"></path>
    <path d="M10 18v3"></path>
    <path d="M14 17.75V21"></path>
    <path d="M7 18a6 6 0 0 0 3.84-10.61"></path>
  </svg>
);

// Enhanced ProviderIcon component that handles Polly and standardizes sizing
const EnhancedProviderIcon = ({ provider }: { provider: string }) => {
  if (provider === "polly") {
    return <PollyIcon />;
  }
  return (
    <div className="w-4 h-4 flex items-center justify-center">
      <ProviderIcon provider={provider} />
    </div>
  );
};

// Memoized model item component
const ModelItem = memo(
  ({
    model,
    onSelect,
  }: {
    model: AIModel;
    onSelect: (value: string) => void;
  }) => {
    const capabilities = useMemo(() => getModelCapabilities(model), [model]);

    const handleSelect = useCallback(() => {
      onSelect(model.modelId);
    }, [model.modelId, onSelect]);

    return (
      <CommandItem
        key={model.modelId}
        value={`${model.name} ${model.provider} ${model.modelId}`}
        onSelect={handleSelect}
        className="py-3 sm:py-2.5 px-4 sm:px-3 cursor-pointer min-h-[44px] sm:min-h-0 hover:bg-accent/50 dark:hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {model.free && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 bg-success-bg text-success border-success-border shrink-0"
              >
                Free
              </Badge>
            )}
            <span className={cn("font-medium text-sm truncate")}>
              {model.name}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {capabilities.length > 0 &&
              capabilities.slice(0, 4).map((capability, index) => {
                const IconComponent = capability.icon;
                return (
                  <Tooltip
                    key={`${model.modelId}-${capability.label}-${index}`}
                  >
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted/50 hover:bg-muted/80 dark:bg-muted/30 dark:hover:bg-muted/50 transition-all duration-200 cursor-help">
                        <IconComponent
                          className={cn(
                            "w-3.5 h-3.5",
                            getCapabilityColor(capability.label)
                          )}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <div>
                        <div className="font-semibold text-foreground">
                          {capability.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {capability.description}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
          </div>
        </div>
      </CommandItem>
    );
  }
);

ModelItem.displayName = "ModelItem";

interface ModelPickerProps {
  className?: string;
}

function ModelPickerComponent({ className }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const token = useAuthToken();
  const navigate = useNavigate();

  const userModelsByProvider = useQuery(api.userModels.getUserModelsByProvider);
  const selectedModel = useSelectedModel();
  const hasEnabledModels = useQuery(api.userModels.hasUserModels);
  const selectModelMutation = useMutation(api.userModels.selectModel);

  // Check if user is authenticated
  const isAuthenticated = !!token;

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
        variant="ghost"
        className={cn(
          "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/60 group disabled:opacity-60",
          className
        )}
        disabled
      >
        <div className="flex items-center gap-1.5">
          <span className="font-medium">Loading models...</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
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
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in-0 duration-200" />
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground group relative picker-trigger",
                "hover:bg-accent/50 dark:hover:bg-accent/30",
                "transition-all duration-200",
                open && "bg-accent/50 dark:bg-accent/30 text-foreground",
                className
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium truncate max-w-[150px]">
                  {displayName}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200 shrink-0",
                    open && "rotate-180 text-foreground"
                  )}
                />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(calc(100vw-2rem),380px)] p-0 overflow-hidden data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 border-border/50 shadow-lg dark:shadow-xl dark:shadow-black/20"
            side="top"
            sideOffset={4}
            collisionPadding={16}
            avoidCollisions={true}
          >
            <div className="relative p-6">
              <h3 className="text-base font-semibold mb-2 text-foreground text-center">
                Sign in for more features!
              </h3>

              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Higher message limits
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {MONTHLY_MESSAGE_LIMIT} messages/month for free
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Key className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Bring your own API keys
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Use OpenAI, Anthropic, Google and OpenRouter models
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Advanced features
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Custom personas, conversation sharing, and more!
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA button - using standard button styles */}
              <Button
                size="sm"
                variant="default"
                className="w-full"
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
              <p className="text-xs text-muted-foreground text-center mt-3">
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/60 group disabled:opacity-60",
              className
            )}
            disabled
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-warning/50" />
              <span className="font-medium">Configure models</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            </div>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Go to Settings → Models to load available models</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      {/* Backdrop blur overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in-0 duration-200" />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-auto px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground group relative picker-trigger",
              "hover:bg-accent/50 dark:hover:bg-accent/30",
              "transition-all duration-200",
              open && "bg-accent/50 dark:bg-accent/30 text-foreground",
              className
            )}
          >
            <div className="flex items-center gap-1.5">
              {selectedModel?.provider === "polly" && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
              {selectedModel?.free && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 bg-success/10 text-success border-success/20 hover:bg-success/10"
                >
                  Free
                </Badge>
              )}
              <span className="font-medium truncate max-w-[150px]">
                {displayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200 shrink-0",
                  open && "rotate-180 text-foreground"
                )}
              />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(calc(100vw-2rem),380px)] p-0 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 border-border/50 shadow-lg dark:shadow-xl dark:shadow-black/20 backdrop-blur-sm"
          side="top"
          sideOffset={4}
          collisionPadding={16}
          avoidCollisions={true}
        >
          <Command className="pt-2">
            <CommandInput placeholder="Search models..." className="h-9" />
            <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
              <CommandEmpty>
                <div className="p-4 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    No models found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search terms
                  </p>
                </div>
              </CommandEmpty>

              {userModelsByProvider?.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
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
                        />
                      ))}
                      {providerIndex < userModelsByProvider.length - 1 && (
                        <div className="h-px bg-border/50 mx-2 my-1.5" />
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
}

export const ModelPicker = memo(ModelPickerComponent);
