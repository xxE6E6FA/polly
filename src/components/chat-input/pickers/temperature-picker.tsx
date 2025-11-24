import { ArrowClockwiseIcon, ThermometerIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { EnhancedSlider } from "@/components/ui/enhanced-slider";
import { Label } from "@/components/ui/label";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useMediaQuery } from "@/hooks/use-media-query";
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
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const currentValue = temperature ?? 0.7;
  const isActive = temperature !== undefined;

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

  const displayValue = isActive ? getTemperatureLabel(currentValue) : "Default";

  const triggerContent = (
    <>
      <ThermometerIcon className="h-3 w-3" />
      {isDesktop && <span className="hidden sm:inline">{displayValue}</span>}
    </>
  );

  return (
    <ResponsivePicker
      trigger={triggerContent}
      title="Temperature Control"
      tooltip="Adjust temperature"
      disabled={disabled}
      ariaLabel="Temperature"
      contentClassName={isDesktop ? "w-64 p-4" : ""}
    >
      {isDesktop ? (
        <TemperatureControlDesktop
          currentValue={currentValue}
          onSliderChange={handleSliderChange}
          onReset={handleReset}
          disabled={disabled}
          getTemperatureLabel={getTemperatureLabel}
        />
      ) : (
        <TemperatureControlMobile
          currentValue={currentValue}
          onSliderChange={handleSliderChange}
          onReset={handleReset}
          onPresetSelect={onTemperatureChange}
          disabled={disabled}
          getTemperatureLabel={getTemperatureLabel}
        />
      )}
    </ResponsivePicker>
  );
};

export const TemperaturePicker = memo(TemperaturePickerComponent);

interface TemperatureControlDesktopProps {
  currentValue: number;
  onSliderChange: (value: number) => void;
  onReset: () => void;
  disabled: boolean;
  getTemperatureLabel: (temp: number) => string;
}

const TemperatureControlDesktop = ({
  currentValue,
  onSliderChange,
  onReset,
  disabled,
  getTemperatureLabel,
}: TemperatureControlDesktopProps) => {
  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <Label className="text-xs font-medium">Temperature</Label>
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
        onValueChange={onSliderChange}
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
          onClick={onReset}
          className="text-xs h-7"
        >
          Reset to Default
        </Button>
      </div>
    </div>
  );
};

interface TemperatureControlMobileProps {
  currentValue: number;
  onSliderChange: (value: number) => void;
  onReset: () => void;
  onPresetSelect: (value: number) => void;
  disabled: boolean;
  getTemperatureLabel: (temp: number) => string;
}

const TemperatureControlMobile = ({
  currentValue,
  onSliderChange,
  onReset,
  onPresetSelect,
  disabled,
  getTemperatureLabel,
}: TemperatureControlMobileProps) => {
  return (
    <>
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
          onValueChange={onSliderChange}
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
              onClick={() => onPresetSelect(preset.value)}
              className={cn(
                "p-2 rounded-md border text-left transition-all",
                "hover:bg-muted hover:border-primary/50",
                currentValue === preset.value
                  ? "border-primary bg-primary/10"
                  : "border-border/30"
              )}
            >
              <div className="font-medium text-sm">{preset.label}</div>
              <div className="text-xs text-muted-foreground">{preset.desc}</div>
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
          onClick={onReset}
          disabled={disabled}
          className="gap-2"
        >
          <ArrowClockwiseIcon className="h-3.5 w-3.5" />
          Reset to Default
        </Button>
      </div>
    </>
  );
};
