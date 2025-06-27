import {
  SparkleIcon,
  LightningIcon,
  CompassIcon,
  LightbulbIcon,
} from "@phosphor-icons/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  hasReasoningCapabilities,
  hasMandatoryReasoning,
} from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import { type AIModel } from "@/types";

export type ReasoningEffortLevel = "low" | "medium" | "high";

export type ReasoningConfig = {
  enabled: boolean;
  effort: ReasoningEffortLevel;
  maxTokens?: number;
};

type ReasoningConfigProps = {
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
    default:
      return {
        icon: SparkleIcon,
        color: "text-muted-foreground",
        bgColor: "bg-accent/50",
        hoverBgColor: "hover:bg-accent/60",
      };
  }
}

export const ReasoningConfigSelect = ({
  model,
  config,
  onConfigChange,
  className,
}: ReasoningConfigProps) => {
  const supportsReasoning = hasReasoningCapabilities(model as AIModel);

  if (!supportsReasoning || !model) {
    return null;
  }

  const isMandatory = hasMandatoryReasoning(model);
  const theme = getProviderTheme(model.provider);
  const Icon = theme.icon;

  // Get current value for the select
  const currentValue = config.enabled ? config.effort : "off";

  // Filter options based on whether reasoning is mandatory
  const availableOptions = isMandatory
    ? REASONING_OPTIONS.filter(opt => opt.value !== "off")
    : REASONING_OPTIONS;

  const handleChange = (value: string) => {
    if (value === "off") {
      onConfigChange({
        ...config,
        enabled: false,
      });
    } else {
      onConfigChange({
        enabled: true,
        effort: value as ReasoningEffortLevel,
        maxTokens: config.maxTokens,
      });
    }
  };

  // For mandatory reasoning models that can't be configured
  if (isMandatory && availableOptions.length === 1) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1.5 h-auto px-2.5 py-1 rounded-md",
              "text-xs font-medium transition-all duration-200",
              theme.bgColor,
              theme.color,
              className
            )}
          >
            <Icon className="h-3.5 w-3.5" weight="duotone" />
            <span>Thinking</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Thinking is always enabled for {model.name}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const selectedOption = availableOptions.find(
    opt => opt.value === currentValue
  );
  const SelectedIcon = selectedOption?.icon;

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger
            className={cn(
              "h-auto w-auto border-0 px-2.5 py-1",
              "text-xs font-medium focus:ring-0 gap-1.5",
              "transition-all duration-200 rounded-md",
              currentValue !== "off"
                ? cn(theme.bgColor, theme.color, theme.hoverBgColor)
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              className
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon
                className="h-3.5 w-3.5"
                weight={currentValue !== "off" ? "duotone" : "regular"}
              />
              <span className="hidden sm:inline">
                {currentValue === "off" ? "Thinking" : selectedOption?.label}
              </span>
              {SelectedIcon && (
                <SelectedIcon
                  className="h-3 w-3 inline sm:hidden"
                  weight="bold"
                />
              )}
            </div>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">
              {currentValue === "off"
                ? "Enable thinking"
                : `Thinking: ${selectedOption?.label}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentValue === "off"
                ? "Click to enable step-by-step thinking"
                : selectedOption?.description}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
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
  );
};
