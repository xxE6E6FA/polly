import {
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
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    const displayText = selectedRatio?.label || "Square";

    return (
      <div className={className}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <Tooltip>
            <TooltipTrigger>
              <PopoverTrigger>
                <Button
                  variant="chat-input"
                  size="sm"
                  disabled={disabled}
                  className={cn(
                    "h-8 w-auto gap-2 px-2.5 text-xs font-medium",
                    "border border-border",
                    "bg-muted text-foreground hover:bg-muted/80",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "transition-all duration-200"
                  )}
                >
                  {selectedRatio ? (
                    <selectedRatio.icon className="h-4 w-4 text-current" />
                  ) : (
                    <Square className="h-4 w-4 text-current" />
                  )}
                  <span className="hidden sm:inline">{displayText}</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">Select aspect ratio</div>
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            forceMount
            data-debug-id="AspectRatioPicker"
            className="w-56 border border-border/50 bg-popover p-3"
            align="start"
            sideOffset={4}
          >
            <div className="stack-sm">
              <div className="grid gap-0.5">
                {ASPECT_RATIOS.map(ratio => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => handleRatioSelect(ratio.value)}
                    className={cn(
                      "flex items-center justify-between p-1.5 rounded-md text-xs transition-colors",
                      "hover:bg-muted",
                      aspectRatio === ratio.value && "bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ratio.icon size={16} />
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
