import {
  CompassIcon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AIModel, ReasoningConfig, ReasoningEffortLevel } from "@/types";

type ReasoningPickerProps = {
  model?: AIModel | null;
  config: ReasoningConfig;
  onConfigChange: (config: ReasoningConfig) => void;
  className?: string;
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
    icon: CompassIcon,
    description: "Standard thinking",
  },
  {
    value: "high",
    label: "Deep",
    icon: LightbulbIcon,
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
        bgColor: "bg-accent/50",
        hoverBgColor: "hover:bg-accent/60",
      };
  }
}

const ReasoningPickerComponent = ({
  model,
  config,
  onConfigChange,
  className,
}: ReasoningPickerProps) => {
  const [selectOpen, setSelectOpen] = useState(false);

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
          case "anthropic":
            maxTokens =
              effort === "low" ? 5000 : effort === "medium" ? 10000 : 20000;
            break;
          case "google":
            maxTokens =
              effort === "low" ? 5000 : effort === "medium" ? 10000 : 20000;
            break;
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
            case "anthropic":
              maxTokens =
                effort === "low" ? 5000 : effort === "medium" ? 10000 : 20000;
              break;
            case "google":
              maxTokens =
                effort === "low" ? 5000 : effort === "medium" ? 10000 : 20000;
              break;
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
                maxTokens =
                  effort === "low" ? 5000 : effort === "medium" ? 10000 : 20000;
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
    <Select
      value={currentValue}
      onValueChange={handleChange}
      open={selectOpen}
      onOpenChange={setSelectOpen}
    >
      <SelectTrigger
        data-debug-id="ReasoningPicker"
        title={
          isMandatory
            ? `Thinking: ${selectedOption?.label || "Balanced"}`
            : currentValue === "off"
              ? "Enable thinking"
              : `Thinking: ${selectedOption?.label}`
        }
        className={cn(
          "h-6 w-auto gap-1 px-1.5 py-0.5 text-xs font-medium sm:h-7 sm:gap-1.5 sm:px-2 sm:text-xs",
          "transition-all duration-200 rounded-md border-0 focus:ring-0 shadow-none",
          currentValue !== "off"
            ? cn(theme.bgColor, theme.color, theme.hoverBgColor)
            : "bg-transparent text-muted-foreground/70 hover:text-foreground/90 hover:bg-accent/40 dark:hover:bg-accent/20",
          className
        )}
      >
        <div className="flex items-center gap-1">
          <Icon
            className={cn(
              "h-3 w-3",
              currentValue !== "off" ? theme.color : "text-muted-foreground/70"
            )}
            weight={currentValue !== "off" ? "duotone" : "regular"}
          />
          <span className="hidden sm:inline">
            {currentValue === "off" ? "Thinking" : selectedOption?.label}
          </span>
          {selectedOption?.icon && (
            <selectedOption.icon
              className={cn(
                "h-2.5 w-2.5 inline sm:hidden",
                currentValue !== "off"
                  ? theme.color
                  : "text-muted-foreground/70"
              )}
              weight="bold"
            />
          )}
        </div>
      </SelectTrigger>
      <SelectContent
        data-debug-id="ReasoningPicker"
        align="end"
        className="min-w-[140px]"
      >
        {availableOptions.map(option => {
          const OptionIcon = option.icon;
          return (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-xs"
            >
              <div className="flex items-center gap-2">
                {OptionIcon ? (
                  <OptionIcon className="h-4 w-4" weight="bold" />
                ) : (
                  <div className="h-4 w-4" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export const ReasoningPicker = memo(ReasoningPickerComponent);
