import {
  CaretDown,
  DeviceMobile,
  DeviceTabletCamera,
  FrameCorners,
  MonitorPlay,
  Square,
} from "@phosphor-icons/react";
import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import { cn } from "@/lib/utils";

interface AspectRatioPickerProps {
  aspectRatio?: string;
  onAspectRatioChange: (aspectRatio: string) => void;
  disabled?: boolean;
  className?: string;
}

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square", icon: Square },
  { value: "16:9", label: "Landscape", icon: MonitorPlay },
  { value: "9:16", label: "Portrait", icon: DeviceMobile },
  { value: "4:3", label: "Standard", icon: FrameCorners },
  { value: "3:4", label: "Tall", icon: DeviceTabletCamera },
];

export const AspectRatioPicker = memo<AspectRatioPickerProps>(
  ({
    aspectRatio = "1:1",
    onAspectRatioChange,
    disabled = false,
    className = "",
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleRatioSelect = useCallback(
      (ratio: string) => {
        onAspectRatioChange(ratio);
        setIsOpen(false);
      },
      [onAspectRatioChange]
    );

    const selectedRatio = ASPECT_RATIOS.find(r => r.value === aspectRatio);
    const displayText = selectedRatio?.value || "1:1";

    return (
      <div className={className}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-8 gap-1 text-xs"
              title={`Aspect Ratio: ${selectedRatio?.label || "Square"}`}
            >
              {selectedRatio ? (
                <selectedRatio.icon size={14} />
              ) : (
                <Square size={14} />
              )}
              <span>{displayText}</span>
              <CaretDown size={12} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="start">
            <div className="space-y-2">
              <div className="grid gap-0.5">
                {ASPECT_RATIOS.map(ratio => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => handleRatioSelect(ratio.value)}
                    className={cn(
                      "flex items-center justify-between p-1.5 rounded-md text-xs transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      aspectRatio === ratio.value &&
                        "bg-accent text-accent-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ratio.icon size={14} />
                      <span className="font-medium">{ratio.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {ratio.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

AspectRatioPicker.displayName = "AspectRatioPicker";
