import { ArrowClockwise, ThermometerIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { EnhancedSlider } from "@/components/ui/enhanced-slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TemperatureDrawerProps {
  temperature?: number;
  onTemperatureChange: (temperature: number | undefined) => void;
  disabled?: boolean;
}

export function TemperatureDrawer({
  temperature,
  onTemperatureChange,
  disabled = false,
}: TemperatureDrawerProps) {
  const currentValue = temperature ?? 0.7;
  // Whether temperature is explicitly set is no longer shown in the trigger UI

  const handleSliderChange = (value: number) => {
    // Round to 1 decimal place
    const roundedValue = Math.round(value * 10) / 10;
    onTemperatureChange(roundedValue);
  };

  const handleReset = () => {
    onTemperatureChange(undefined);
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

  // Trigger button is icon-only now; keep text mapping for in-drawer labels only

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Temperature"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <ThermometerIcon className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Temperature Control</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {/* Temperature Slider */}
          <div className="stack-md mb-4">
            <div className="stack-sm">
              <Label className="text-sm font-medium">Adjust Temperature</Label>
              <div className="text-xs text-muted-foreground">
                Controls response randomness. Higher values = more varied and
                creative responses.
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
          </div>

          {/* Preset Temperatures */}
          <div className="stack-md">
            <Label className="text-sm font-medium">Quick Presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 0.1, label: "Focused", desc: "Very consistent" },
                { value: 0.7, label: "Balanced", desc: "Default setting" },
                { value: 1.0, label: "Creative", desc: "More varied" },
                { value: 1.5, label: "Wild", desc: "Highly creative" },
              ].map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onTemperatureChange(preset.value)}
                  className={cn(
                    "p-2 rounded-md border text-left transition-all",
                    "hover:bg-accent/50 hover:border-primary/50",
                    currentValue === preset.value
                      ? "border-primary bg-primary/10"
                      : "border-border/30"
                  )}
                >
                  <div className="font-medium text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {preset.desc}
                  </div>
                  <div className="text-xs font-mono text-primary mt-1">
                    {preset.value.toFixed(1)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reset Button */}
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={disabled}
              className="gap-2"
            >
              <ArrowClockwise className="h-3.5 w-3.5" />
              Reset to Default
            </Button>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
