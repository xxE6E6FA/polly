import {
  BrainIcon,
  LightbulbIcon,
  LightningIcon,
  SparkleIcon,
} from "@phosphor-icons/react";

import {
  getModelReasoningInfo,
  getProviderReasoningRequirements,
  hasMandatoryReasoning,
} from "@shared/reasoning-model-detection";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { AIModel, ReasoningConfig, ReasoningEffortLevel } from "@/types";

// Provider colors are applied via theme; icon reflects selected effort

type ReasoningPickerProps = {
  model?: AIModel | null;
  config: ReasoningConfig;
  onConfigChange: (config: ReasoningConfig) => void;
  className?: string;
  disabled?: boolean;
};

type ReasoningOption = {
  value: "off" | ReasoningEffortLevel;
  label: string;
  icon: React.ElementType | null;
  description: string;
};

const reasoningOptions: ReasoningOption[] = [
  {
    value: "off",
    label: "Off",
    icon: null,
    description: "Standard responses",
  },
  {
    value: "low",
    label: "Quick",
    icon: LightningIcon,
    description: "Fast thinking",
  },
  {
    value: "medium",
    label: "Balanced",
    icon: LightbulbIcon,
    description: "Standard thinking",
  },
  {
    value: "high",
    label: "Deep",
    icon: BrainIcon,
    description: "Thorough thinking",
  },
];

function getProviderTheme(provider?: string) {
  switch (provider) {
    case "anthropic":
      return {
        icon: SparkleIcon,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        hoverBgColor: "hover:bg-orange-500/20",
      };
    case "groq":
      return {
        icon: SparkleIcon,
        color: "text-[#F54F35]",
        bgColor: "bg-[#F54F35]/10",
        hoverBgColor: "hover:bg-[#F54F35]/20",
      };
    case "openai":
      return {
        icon: SparkleIcon,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        hoverBgColor: "hover:bg-green-500/20",
      };
    case "google":
      return {
        icon: SparkleIcon,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        hoverBgColor: "hover:bg-blue-500/20",
      };
    case "openrouter":
      return {
        icon: SparkleIcon,
        color: "text-purple-500",
        bgColor: "bg-purple-500/10",
        hoverBgColor: "hover:bg-purple-500/20",
      };
    case "polly":
      return {
        icon: SparkleIcon,
        color: "text-amber-500",
        bgColor: "bg-gradient-to-r from-amber-500/10 to-orange-500/10",
        hoverBgColor: "hover:from-amber-500/15 hover:to-orange-500/15",
      };
    default:
      return {
        icon: SparkleIcon,
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        hoverBgColor: "hover:bg-muted/60",
      };
  }
}

const ReasoningPickerComponent = ({
  model,
  config,
  onConfigChange,
  className,
  disabled = false,
}: ReasoningPickerProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Get the actual provider once for the entire component
  const provider = useMemo(() => {
    if (!model) {
      return null;
    }

    // Provider is now the actual provider, no mapping needed
    return model.provider;
  }, [model]);

  // Handle mandatory reasoning and provider-specific defaults when model changes
  useEffect(() => {
    if (model && provider) {
      const isMandatory = hasMandatoryReasoning(provider, model.modelId);
      const modelInfo = getModelReasoningInfo(provider, model.modelId);

      if (isMandatory && !config.enabled) {
        // Auto-enable reasoning for mandatory models
        let defaultEffort: ReasoningEffortLevel = "medium";
        let defaultMaxTokens = config.maxTokens;

        // Set provider-specific defaults for better experience
        if (provider === "openai") {
          // OpenAI o-series models work well with medium effort by default
          defaultEffort = "medium";
        } else if (
          provider === "google" &&
          model.modelId.includes("gemini-2.5-pro")
        ) {
          // Gemini 2.5 Pro enforces reasoning, start with balanced approach
          defaultEffort = "medium";
          defaultMaxTokens = 10000; // Default max tokens for Gemini 2.5 Pro
        }

        const newConfig = {
          enabled: true,
          effort: defaultEffort,
          maxTokens: defaultMaxTokens,
        };
        onConfigChange(newConfig);
      } else if (
        modelInfo.reasoningType === "optional" &&
        config.enabled &&
        !config.maxTokens
      ) {
        // Set appropriate token budgets for optional reasoning models
        let maxTokens = config.maxTokens;
        const effort = config.effort || "medium";

        switch (provider) {
          case "anthropic": {
            if (effort === "low") {
              maxTokens = 5000;
            } else if (effort === "medium") {
              maxTokens = 10000;
            } else {
              maxTokens = 20000;
            }
            break;
          }
          case "google": {
            if (effort === "low") {
              maxTokens = 5000;
            } else if (effort === "medium") {
              maxTokens = 10000;
            } else {
              maxTokens = 20000;
            }
            break;
          }
          default:
            maxTokens = 8192;
        }

        if (maxTokens !== config.maxTokens) {
          onConfigChange({
            ...config,
            maxTokens,
          });
        }
      }
    }
  }, [model, config, onConfigChange, provider]);

  const handleChange = useCallback(
    (value: string) => {
      setPopoverOpen(false); // Close popover after selection

      if (value === "off") {
        onConfigChange({
          ...config,
          enabled: false,
        });
      } else {
        const effort = value as ReasoningEffortLevel;
        let maxTokens = config.maxTokens;

        // Auto-set appropriate token budgets if not already set
        if (!maxTokens && model && provider) {
          switch (provider) {
            case "anthropic": {
              if (effort === "low") {
                maxTokens = 5000;
              } else if (effort === "medium") {
                maxTokens = 10000;
              } else {
                maxTokens = 20000;
              }
              break;
            }
            case "google": {
              if (effort === "low") {
                maxTokens = 5000;
              } else if (effort === "medium") {
                maxTokens = 10000;
              } else {
                maxTokens = 20000;
              }
              break;
            }
            case "openrouter": {
              // For OpenRouter, use different defaults based on model type
              const requirements =
                getProviderReasoningRequirements("openrouter");
              const isTokenModel =
                requirements &&
                "supportsDifferentControls" in requirements &&
                requirements.supportsDifferentControls.maxTokens.some(
                  (pattern: string) =>
                    model.modelId?.toLowerCase().includes(pattern.toLowerCase())
                );

              if (isTokenModel) {
                // For token-based models (Anthropic, Gemini via OpenRouter)
                if (effort === "low") {
                  maxTokens = 5000;
                } else if (effort === "medium") {
                  maxTokens = 10000;
                } else {
                  maxTokens = 20000;
                }
              } else {
                // For effort-based models (OpenAI, Grok via OpenRouter)
                maxTokens = 8192; // Default fallback
              }
              break;
            }
            default:
              maxTokens = 8192;
          }
        }

        onConfigChange({
          enabled: true,
          effort,
          maxTokens,
        });
      }
    },
    [config, onConfigChange, model, provider]
  );

  if (!(model?.supportsReasoning && provider)) {
    return null;
  }

  const isMandatory = hasMandatoryReasoning(provider, model.modelId);
  const theme = getProviderTheme(provider);
  const Icon = theme.icon;

  let currentValue: string;
  if (isMandatory || config.enabled) {
    currentValue = config.effort || "medium";
  } else {
    currentValue = "off";
  }

  const availableOptions = isMandatory
    ? reasoningOptions.filter(opt => opt.value !== "off")
    : reasoningOptions;

  const selectedOption = availableOptions.find(
    opt => opt.value === currentValue
  );

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger disabled={disabled}>
            <Button
              type="button"
              variant="ghost"
              size="pill"
              disabled={disabled}
              className={cn(
                "border border-border",
                "transition-all duration-200",
                // Subtle at rest; provider-accent when active
                currentValue !== "off"
                  ? cn(theme.bgColor, theme.hoverBgColor, theme.color)
                  : "bg-muted text-foreground hover:bg-muted/80",
                className
              )}
            >
              <div className="flex items-center gap-1">
                {selectedOption?.icon ? (
                  <selectedOption.icon
                    className={cn("h-3 w-3 text-current")}
                    weight="bold"
                  />
                ) : (
                  <Icon
                    className={cn("h-3 w-3 text-current")}
                    weight="regular"
                  />
                )}
                <span className="hidden sm:inline">
                  {currentValue === "off" ? "Thinking" : selectedOption?.label}
                </span>
              </div>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Configure thinking</div>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[160px] p-1" rounded>
        <div className="flex flex-col gap-0.5">
          {availableOptions.map(option => {
            const OptionIcon = option.icon;
            const isSelected = option.value === currentValue;
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleChange(option.value)}
                className={cn(
                  "h-auto w-full justify-start gap-2 px-2 py-1.5 text-xs font-normal",
                  isSelected && "bg-muted"
                )}
              >
                {OptionIcon ? (
                  <OptionIcon className="h-4 w-4 shrink-0" weight="bold" />
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const ReasoningPicker = memo(ReasoningPickerComponent);
