import { ArrowCounterClockwise, Gear } from "@phosphor-icons/react";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { EnhancedSlider } from "@/components/ui/enhanced-slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { ImageGenerationParams } from "@/types";

interface ImageGenerationSettingsProps {
  params: ImageGenerationParams;
  onParamsChange: (params: Partial<ImageGenerationParams>) => void;
  selectedModel?: {
    modelId: string;
    supportsMultipleImages?: boolean;
  };
  disabled?: boolean;
  className?: string;
}

export function hasAdvancedImageSettings(
  params: ImageGenerationParams,
  selectedModel?: { supportsMultipleImages?: boolean }
) {
  return (
    (selectedModel?.supportsMultipleImages &&
      params.count !== undefined &&
      params.count !== IMAGE_GENERATION_DEFAULTS.COUNT) ||
    (params.steps !== undefined &&
      params.steps !== IMAGE_GENERATION_DEFAULTS.STEPS) ||
    (params.guidanceScale !== undefined &&
      params.guidanceScale !== IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE) ||
    params.seed !== undefined
  );
}

export function getImageSettingsResetParams(selectedModel?: {
  supportsMultipleImages?: boolean;
}) {
  const resetParams: Partial<ImageGenerationParams> = {
    steps: IMAGE_GENERATION_DEFAULTS.STEPS,
    guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
    seed: undefined,
    negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
  };

  if (selectedModel?.supportsMultipleImages) {
    resetParams.count = IMAGE_GENERATION_DEFAULTS.COUNT;
  }

  return resetParams;
}

export function ImageGenerationSettingsContent({
  params,
  onParamsChange,
  selectedModel,
  disabled = false,
  className = "",
}: ImageGenerationSettingsProps) {
  const handleChange = useCallback(
    (
      field: keyof ImageGenerationParams,
      value: string | number | undefined
    ) => {
      onParamsChange({ [field]: value });
    },
    [onParamsChange]
  );

  return (
    <div className={cn("stack-lg", className)}>
      {selectedModel?.supportsMultipleImages && (
        <div className="stack-md">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Output
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Images</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={disabled || (params.count || 1) <= 1}
                onClick={() =>
                  handleChange("count", Math.max(1, (params.count || 1) - 1))
                }
              >
                −
              </Button>
              <span className="min-w-[2ch] text-center text-sm font-medium">
                {params.count || 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={disabled || (params.count || 1) >= 4}
                onClick={() =>
                  handleChange("count", Math.min(4, (params.count || 1) + 1))
                }
              >
                +
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedModel?.supportsMultipleImages && (
        <div className="border-t border-border" />
      )}

      <div className="stack-md">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Quality
        </div>

        <EnhancedSlider
          label="Steps"
          value={params.steps}
          defaultValue={IMAGE_GENERATION_DEFAULTS.STEPS}
          min={1}
          max={50}
          step={1}
          onValueChange={value => handleChange("steps", value)}
          disabled={disabled}
          formatValue={value =>
            value === IMAGE_GENERATION_DEFAULTS.STEPS ? "auto" : String(value)
          }
          showSpinners={true}
          className="stack-sm"
        />

        <EnhancedSlider
          label="Guidance"
          value={params.guidanceScale}
          defaultValue={IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE}
          min={1}
          max={20}
          step={0.5}
          onValueChange={value => handleChange("guidanceScale", value)}
          disabled={disabled}
          formatValue={value =>
            value === IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE
              ? "auto"
              : String(value)
          }
          showSpinners={true}
          className="stack-sm"
        />
      </div>

      <div className="border-t border-border" />

      <div className="stack-md">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Control
        </div>

        <div className="stack-sm">
          <Label className="text-sm font-medium">Seed</Label>
          <Input
            type="number"
            value={params.seed || ""}
            onChange={e =>
              handleChange(
                "seed",
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            placeholder="Random"
            className="h-8 text-sm"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export const ImageGenerationSettings = memo<ImageGenerationSettingsProps>(
  ({
    params,
    onParamsChange,
    selectedModel,
    disabled = false,
    className = "",
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    const hasAdvancedSettings = hasAdvancedImageSettings(params, selectedModel);

    return (
      <div className={className}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <Tooltip>
            <TooltipTrigger>
              <PopoverTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className={cn(
                    "h-8 w-auto gap-2 px-2.5 text-xs font-medium",
                    "rounded-full border border-border",
                    "bg-muted text-foreground hover:bg-muted/80",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "transition-all duration-200",
                    "relative"
                  )}
                >
                  <Gear className="h-4 w-4 text-current" />
                  <span className="hidden sm:inline">Settings</span>
                  {hasAdvancedSettings && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">Open image generation settings</div>
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            data-debug-id="ImageGenerationSettings"
            className="flex w-80 max-h-[50vh] flex-col overflow-hidden border border-border/50 bg-popover p-4"
            align="end"
            sideOffset={8}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h3 className="text-sm font-medium">Generation Settings</h3>
              {hasAdvancedSettings && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onParamsChange(getImageSettingsResetParams(selectedModel))
                  }
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowCounterClockwise size={12} className="mr-1.5" />
                  Reset
                </Button>
              )}
            </div>
            <ImageGenerationSettingsContent
              params={params}
              onParamsChange={onParamsChange}
              selectedModel={selectedModel}
              disabled={disabled}
              className="pt-4 overflow-y-auto flex-1 min-h-0"
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

ImageGenerationSettings.displayName = "ImageGenerationSettings";
