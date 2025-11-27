import type { Doc } from "@convex/_generated/dataModel";
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
import { memo, useCallback, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { PickerOption, PickerSection } from "@/components/ui/picker-content";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import {
  SelectableListItem,
  SelectableListItemIcon,
} from "@/components/ui/selectable-list-item";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { AIModel, ReasoningConfig, ReasoningEffortLevel } from "@/types";

type ReasoningOption = {
  value: "off" | ReasoningEffortLevel;
  label: string;
  icon: React.ElementType | null;
  description: string;
  tokenEstimate?: string;
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
    tokenEstimate: "~5K tokens",
  },
  {
    value: "medium",
    label: "Balanced",
    icon: LightbulbIcon,
    description: "Standard thinking",
    tokenEstimate: "~10K tokens",
  },
  {
    value: "high",
    label: "Deep",
    icon: BrainIcon,
    description: "Thorough thinking",
    tokenEstimate: "~20K tokens",
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

type ReasoningPickerProps = {
  model?: AIModel | null;
  config: ReasoningConfig;
  onConfigChange: (config: ReasoningConfig) => void;
  className?: string;
  disabled?: boolean;
};

const ReasoningPickerComponent = ({
  model,
  config,
  onConfigChange,
  className,
  disabled = false,
}: ReasoningPickerProps) => {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  // Simple property access - React Compiler will optimize if needed
  const provider = model?.provider ?? null;

  // Handle mandatory reasoning and provider-specific defaults when model changes
  useEffect(() => {
    if (model && provider) {
      const isMandatory = hasMandatoryReasoning(provider, model.modelId);
      const modelInfo = getModelReasoningInfo(provider, model.modelId);

      if (isMandatory && !config.enabled) {
        let defaultEffort: ReasoningEffortLevel = "medium";
        let defaultMaxTokens = config.maxTokens;

        if (provider === "openai") {
          defaultEffort = "medium";
        } else if (
          provider === "google" &&
          model.modelId.includes("gemini-2.5-pro")
        ) {
          defaultEffort = "medium";
          defaultMaxTokens = 10000;
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
      if (value === "off") {
        onConfigChange({
          ...config,
          enabled: false,
        });
      } else {
        const effort = value as ReasoningEffortLevel;
        let maxTokens = config.maxTokens;

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
                if (effort === "low") {
                  maxTokens = 5000;
                } else if (effort === "medium") {
                  maxTokens = 10000;
                } else {
                  maxTokens = 20000;
                }
              } else {
                maxTokens = 8192;
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

  const triggerContent = (
    <div className="flex items-center gap-1">
      {selectedOption?.icon ? (
        <selectedOption.icon
          className={cn("h-3 w-3 text-current")}
          weight="bold"
        />
      ) : (
        <Icon className={cn("h-3 w-3 text-current")} weight="regular" />
      )}
      {isDesktop && (
        <span className="hidden sm:inline">
          {currentValue === "off" ? "Thinking" : selectedOption?.label}
        </span>
      )}
    </div>
  );

  return (
    <ResponsivePicker
      trigger={triggerContent}
      title="Reasoning Configuration"
      tooltip="Configure thinking"
      disabled={disabled}
      pickerVariant={currentValue !== "off" ? "active" : "default"}
      triggerClassName={cn(
        currentValue !== "off" &&
          cn(theme.bgColor, theme.hoverBgColor, theme.color),
        className
      )}
      contentClassName={isDesktop ? "w-[200px] p-0" : ""}
      align="end"
      ariaLabel="Reasoning settings"
    >
      {isDesktop ? (
        <ReasoningControlDesktop
          availableOptions={availableOptions}
          currentValue={currentValue}
          onSelect={handleChange}
        />
      ) : (
        <ReasoningControlMobile
          model={model as Doc<"userModels">}
          config={config}
          onConfigChange={onConfigChange}
          isMandatory={isMandatory}
          provider={provider}
          disabled={disabled}
        />
      )}
    </ResponsivePicker>
  );
};

export const ReasoningPicker = memo(ReasoningPickerComponent);

// Desktop: Simple list of options
interface ReasoningControlDesktopProps {
  availableOptions: ReasoningOption[];
  currentValue: string;
  onSelect: (value: string) => void;
}

const ReasoningControlDesktop = ({
  availableOptions,
  currentValue,
  onSelect,
}: ReasoningControlDesktopProps) => {
  return (
    <PickerSection>
      {availableOptions.map(option => {
        const OptionIcon = option.icon;
        const isSelected = option.value === currentValue;
        return (
          <PickerOption
            key={option.value}
            label={option.label}
            description={option.description}
            icon={
              OptionIcon ? (
                <OptionIcon className="h-3.5 w-3.5" weight="bold" />
              ) : (
                <SparkleIcon className="h-3.5 w-3.5 opacity-40" />
              )
            }
            selected={isSelected}
            onClick={() => onSelect(option.value)}
          />
        );
      })}
    </PickerSection>
  );
};

// Mobile: Full configuration interface
interface ReasoningControlMobileProps {
  model: Doc<"userModels"> | null;
  config: ReasoningConfig;
  onConfigChange: (config: ReasoningConfig) => void;
  isMandatory: boolean;
  provider: string;
  disabled: boolean;
}

const ReasoningControlMobile = ({
  model,
  config,
  onConfigChange,
  isMandatory,
  provider,
  disabled,
}: ReasoningControlMobileProps) => {
  const canDisable = !isMandatory;
  const currentEffort = config.enabled ? config.effort || "medium" : "medium";

  const handleEffortChange = (effort: ReasoningEffortLevel) => {
    let maxTokens = config.maxTokens;

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
        default:
          maxTokens = 8192;
      }
    }

    onConfigChange({
      enabled: true,
      effort,
      maxTokens,
    });
  };

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      onConfigChange({
        enabled: true,
        effort: config.effort || "medium",
        maxTokens: config.maxTokens || 10000,
      });
    } else {
      onConfigChange({
        enabled: false,
        effort: "medium",
        maxTokens: undefined,
      });
    }
  };

  return (
    <>
      {/* Enable/Disable Switch */}
      {canDisable && (
        <div className="flex items-center justify-between mb-4">
          <div className="stack-sm">
            <Label className="text-sm font-medium">Enable Reasoning</Label>
            <div className="text-xs text-muted-foreground">
              Step-by-step thinking for better problem solving
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggle}
            disabled={disabled}
          />
        </div>
      )}

      {/* Effort Level Selection */}
      {config.enabled && (
        <div className="stack-sm">
          <Label className="text-sm font-medium">Reasoning Effort</Label>
          <div className="grid gap-2">
            {reasoningOptions
              .filter(opt => opt.value !== "off")
              .map(option => {
                const Icon = option.icon;
                const isSelected = currentEffort === option.value;

                return (
                  <SelectableListItem
                    key={option.value}
                    onClick={() =>
                      handleEffortChange(option.value as ReasoningEffortLevel)
                    }
                    selected={isSelected}
                    className="p-2"
                    rightAdornment={
                      <BrainIcon className="h-4 w-4 text-primary" />
                    }
                  >
                    <div className="flex items-center gap-2">
                      <SelectableListItemIcon>
                        {Icon && <Icon className="h-4 w-4" />}
                      </SelectableListItemIcon>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">
                          {option.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {option.tokenEstimate}
                        </div>
                      </div>
                    </div>
                  </SelectableListItem>
                );
              })}
          </div>
        </div>
      )}

      {/* Token Budget Info */}
      {config.enabled && config.maxTokens && (
        <div className="text-center text-xs text-muted-foreground">
          Token budget: ~{config.maxTokens.toLocaleString()}
        </div>
      )}

      {/* Provider-specific Info */}
      {provider && (
        <div className="text-xs text-muted-foreground text-center">
          {provider === "anthropic" &&
            "Claude models excel at step-by-step reasoning"}
          {provider === "google" && "Gemini models provide structured thinking"}
          {provider === "openai" &&
            "OpenAI models offer balanced reasoning capabilities"}
          {provider === "openrouter" &&
            "OpenRouter provides access to various reasoning models"}
        </div>
      )}
    </>
  );
};
