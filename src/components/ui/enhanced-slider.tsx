import { forwardRef, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface EnhancedSliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
  label?: string;
  className?: string;
  showInput?: boolean;
  showSpinners?: boolean;
  formatValue?: (value: number) => string;
  unit?: string;
}

export const EnhancedSlider = forwardRef<HTMLDivElement, EnhancedSliderProps>(
  (
    {
      value,
      defaultValue = 0,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      onValueChange,
      label,
      className,
      showInput = true,
      showSpinners = true,
      formatValue,
      unit,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(
      value ?? defaultValue ?? min
    );
    const [inputValue, setInputValue] = useState(
      String(value ?? defaultValue ?? min)
    );

    const currentValue = value ?? internalValue;

    const handleSliderChange = useCallback(
      (newValue: number[]) => {
        const val = newValue[0];
        setInternalValue(val);
        setInputValue(String(val));
        onValueChange?.(val);
      },
      [onValueChange]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputVal = e.target.value;
        setInputValue(inputVal);

        const numVal = parseFloat(inputVal);
        if (!isNaN(numVal) && numVal >= min && numVal <= max) {
          setInternalValue(numVal);
          onValueChange?.(numVal);
        }
      },
      [min, max, onValueChange]
    );

    const handleInputBlur = useCallback(() => {
      const numVal = parseFloat(inputValue);
      if (isNaN(numVal) || numVal < min || numVal > max) {
        setInputValue(String(currentValue));
      }
    }, [inputValue, min, max, currentValue]);

    const displayValue = formatValue
      ? formatValue(currentValue)
      : `${currentValue}${unit ? ` ${unit}` : ""}`;

    return (
      <div ref={ref} className={cn("space-y-3", className)} {...props}>
        {label && (
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{label}</Label>
            <span className="text-xs text-muted-foreground">
              {displayValue}
            </span>
          </div>
        )}

        <div className="space-y-3">
          {/* Slider */}
          <Slider
            value={[currentValue]}
            onValueChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="w-full"
          />

          {/* Direct Input */}
          {showInput && (
            <Input
              type="number"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              className={cn(
                "h-8 text-center text-sm",
                showSpinners
                  ? "number-input-with-spinners"
                  : "number-input-no-spinners"
              )}
            />
          )}

          {/* Min/Max Labels */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatValue ? formatValue(min) : min}</span>
            <span>{formatValue ? formatValue(max) : max}</span>
          </div>
        </div>
      </div>
    );
  }
);

EnhancedSlider.displayName = "EnhancedSlider";
