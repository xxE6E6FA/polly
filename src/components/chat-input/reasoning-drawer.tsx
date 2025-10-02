import type { Doc } from "@convex/_generated/dataModel";
import { BrainIcon, LightbulbIcon, LightningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import {
  SelectableListItem,
  SelectableListItemIcon,
} from "@/components/ui/selectable-list-item";
import { Switch } from "@/components/ui/switch";
import type { ReasoningConfig, ReasoningEffortLevel } from "@/types";

interface ReasoningDrawerProps {
  model: Doc<"userModels"> | null;
  config: ReasoningConfig;
  onConfigChange: (config: ReasoningConfig) => void;
  disabled?: boolean;
}

const reasoningOptions: Array<{
  value: ReasoningEffortLevel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  tokenEstimate: string;
}> = [
  {
    value: "low",
    label: "Quick",
    icon: LightningIcon,
    description: "Fast thinking with minimal token usage",
    tokenEstimate: "~5K tokens",
  },
  {
    value: "medium",
    label: "Balanced",
    icon: LightbulbIcon,
    description: "Standard thinking with moderate token usage",
    tokenEstimate: "~10K tokens",
  },
  {
    value: "high",
    label: "Deep",
    icon: BrainIcon,
    description: "Thorough thinking with maximum token usage",
    tokenEstimate: "~20K tokens",
  },
];

export function ReasoningDrawer({
  model,
  config,
  onConfigChange,
  disabled = false,
}: ReasoningDrawerProps) {
  if (!model) {
    return null;
  }

  if (!("userId" in model)) {
    return null;
  }

  const provider = model.provider;
  const isMandatory =
    provider === "google" && model.modelId.includes("gemini-2.5-pro");
  const canDisable = !isMandatory;

  const handleEffortChange = (effort: ReasoningEffortLevel) => {
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

  const currentEffort = config.enabled ? config.effort || "medium" : "medium";
  // Selected option is not shown in the trigger anymore; keep internal mapping minimal

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Reasoning settings"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <BrainIcon className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Reasoning Configuration</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
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
                {reasoningOptions.map(option => {
                  const Icon = option.icon;
                  const isSelected = currentEffort === option.value;

                  return (
                    <SelectableListItem
                      key={option.value}
                      onClick={() => handleEffortChange(option.value)}
                      selected={isSelected}
                      className="p-2"
                      rightAdornment={
                        <BrainIcon className="h-4 w-4 text-primary" />
                      }
                    >
                      <div className="flex items-center gap-2">
                        <SelectableListItemIcon>
                          <Icon className="h-4 w-4" />
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
              {provider === "google" &&
                "Gemini models provide structured thinking"}
              {provider === "openai" &&
                "OpenAI models offer balanced reasoning capabilities"}
              {provider === "openrouter" &&
                "OpenRouter provides access to various reasoning models"}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
