import { ThermometerIcon } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EnhancedSlider } from "@/components/ui/enhanced-slider";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TemperaturePickerProps {
  temperature?: number;
  onTemperatureChange: (temperature?: number) => void;
  disabled?: boolean;
}

const TemperaturePickerComponent = ({
  temperature,
  onTemperatureChange,
  disabled = false,
}: TemperaturePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentValue = temperature ?? 0.7;
  const isActive = temperature !== undefined;

  const handleSliderChange = (value: number) => {
    // Round to 1 decimal place
    const roundedValue = Math.round(value * 10) / 10;
    onTemperatureChange(roundedValue);
  };

  const handleReset = () => {
    onTemperatureChange(undefined);
    setIsOpen(false);
  };

  const getTemperatureLabel = (temp: number) => {
    if (temp <= 0.3) {
      return "Focused";
    }
    if (temp <= 0.8) {
      return "Balanced";
    }
    if (temp <= 1.2) {
      return "Creative";
    }
    return "Wild";
  };

  const displayValue = isActive ? getTemperatureLabel(currentValue) : "Default";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className={cn(
                // Unified pill size and look
                "h-8 w-auto gap-2 px-2.5 text-xs font-medium",
                "rounded-full border border-border/50",
                "bg-muted/20 text-foreground/85 hover:bg-muted/40",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "transition-all duration-200"
              )}
            >
              <ThermometerIcon
                className={cn(
                  "h-3 w-3",
                  isActive ? "text-foreground/90" : "text-muted-foreground/70"
                )}
              />
              <span className="hidden sm:inline">{displayValue}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Adjust temperature</div>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-64 p-4 border-border/50 shadow-sm"
        align="start"
        sideOffset={4}
      >
        <div className="stack-lg">
          <div className="stack-sm">
            <Label className="text-sm font-medium">Temperature</Label>
            <div className="text-xs text-muted-foreground">
              Controls response randomness. Higher = more varied and creative.
            </div>
          </div>

          <EnhancedSlider
            label="Temperature"
            value={currentValue}
            defaultValue={0.7}
            min={0}
            max={2}
            step={0.1}
            onValueChange={handleSliderChange}
            disabled={disabled}
            formatValue={value =>
              `${value.toFixed(1)} (${getTemperatureLabel(value)})`
            }
            showSpinners={true}
            className="stack-sm"
          />

          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs h-7"
            >
              Reset to Default
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const TemperaturePicker = memo(TemperaturePickerComponent);
