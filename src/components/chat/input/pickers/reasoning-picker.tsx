import { SparkleIcon } from "@phosphor-icons/react";
import { memo, useEffect } from "react";
import { PickerTrigger } from "@/components/ui/picker-trigger";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HydratedModel, ReasoningConfig } from "@/types";

type ReasoningPickerProps = {
  model?: HydratedModel | null;
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
  // Mandatory = supports reasoning but NOT temperature (from models.dev)
  const isMandatory =
    model?.supportsReasoning === true && model?.supportsTemperature === false;

  // Force-enable for mandatory reasoning models
  useEffect(() => {
    if (isMandatory && !config.enabled) {
      onConfigChange({ enabled: true });
    }
  }, [isMandatory, config.enabled, onConfigChange]);

  if (!model?.supportsReasoning) {
    return null;
  }

  const isActive = isMandatory || config.enabled;

  const handleClick = () => {
    if (disabled || isMandatory) {
      return;
    }
    onConfigChange({ enabled: !config.enabled });
  };

  return (
    <Tooltip>
      <TooltipTrigger delayDuration={200}>
        <PickerTrigger
          variant={isActive ? "active" : "ghost"}
          size="icon"
          onClick={handleClick}
          disabled={disabled || isMandatory}
          aria-label={isActive ? "Disable reasoning" : "Enable reasoning"}
          aria-pressed={isActive}
          className={className}
        >
          <SparkleIcon weight={isActive ? "fill" : "regular"} />
        </PickerTrigger>
      </TooltipTrigger>
      <TooltipContent>
        {(() => {
          if (isMandatory) {
            return "Reasoning always on for this model";
          }
          if (isActive) {
            return "Thinking enabled";
          }
          return "Enable thinking";
        })()}
      </TooltipContent>
    </Tooltip>
  );
};

export const ReasoningPicker = memo(ReasoningPickerComponent);
