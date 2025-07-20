import {
  CompassIcon,
  LightbulbIcon,
  LightningIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { hasMandatoryReasoning } from "@shared/model-capabilities-config";
import {
  ANTHROPIC_BUDGET_MAP,
  GOOGLE_THINKING_BUDGET_MAP,
} from "@shared/reasoning-config";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
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

const REASONING_OPTIONS: ReasoningOption[] = [
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
    description: "Standard depth",
  },
  {
    value: "high",
    label: "Deep",
    icon: LightbulbIcon,
    description: "Thorough analysis",
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

export const ReasoningPicker = ({
  model,
  config,
  onConfigChange,
  className,
}: ReasoningPickerProps) => {
  const [selectOpen, setSelectOpen] = useState(false);

  // Handle mandatory reasoning when model changes
  useEffect(() => {
    if (model) {
      const isMandatory = hasMandatoryReasoning(model.provider, model.modelId);
      if (isMandatory && !config.enabled) {
        const newConfig = {
          enabled: true,
          effort: config.effort || "medium",
          maxTokens: config.maxTokens,
        };
        onConfigChange(newConfig);
      }
    }
  }, [model, config.enabled, config.effort, config.maxTokens, onConfigChange]);

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
        if (!maxTokens) {
          switch (model?.provider) {
            case "anthropic":
              maxTokens = ANTHROPIC_BUDGET_MAP[effort];
              break;
            case "google":
              maxTokens = GOOGLE_THINKING_BUDGET_MAP[effort];
              break;
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
    [config, onConfigChange, model]
  );

  if (!model?.supportsReasoning) {
    return null;
  }

  const isMandatory = hasMandatoryReasoning(model.provider, model.modelId);
  const theme = getProviderTheme(model.provider);
  const Icon = theme.icon;

  let currentValue = "medium";
  if (!(isMandatory || config.enabled)) {
    currentValue = "off";
  } else if (config.enabled && config.effort) {
    currentValue = config.effort;
  }

  const availableOptions = isMandatory
    ? REASONING_OPTIONS.filter(opt => opt.value !== "off")
    : REASONING_OPTIONS;

  const selectedOption = availableOptions.find(
    opt => opt.value === currentValue
  );

  return (
    <TooltipWrapper
      open={selectOpen ? false : undefined}
      delayDuration={700}
      side="top"
      className="max-w-xs"
      content={
        <div className="space-y-1">
          <p className="font-medium">
            {isMandatory
              ? `Thinking: ${selectedOption?.label || "Balanced"}`
              : currentValue === "off"
                ? "Enable thinking"
                : `Thinking: ${selectedOption?.label}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {isMandatory
              ? `Thinking is always enabled for ${model.name}. Configure effort level.`
              : currentValue === "off"
                ? "Click to enable step-by-step thinking"
                : selectedOption?.description}
          </p>
        </div>
      }
    >
      <Select
        value={currentValue}
        onValueChange={handleChange}
        open={selectOpen}
        onOpenChange={setSelectOpen}
      >
        <SelectTrigger
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
                currentValue !== "off"
                  ? theme.color
                  : "text-muted-foreground/70"
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
        <SelectContent align="end" className="min-w-[140px]">
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
    </TooltipWrapper>
  );
};
