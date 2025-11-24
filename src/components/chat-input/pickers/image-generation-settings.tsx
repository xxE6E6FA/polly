import { ArrowCounterClockwise, Gear } from "@phosphor-icons/react";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { EnhancedSlider } from "@/components/ui/enhanced-slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { ImageGenerationParams } from "@/types";

interface ImageGenerationSettingsProps {
  params: ImageGenerationParams;
  onParamsChange: (params: Partial<ImageGenerationParams>) => void;
  selectedModel?: {
    modelId: string;
    supportsMultipleImages?: boolean;
  };
  lastGeneratedImageSeed?: number;
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

interface ImageGenerationControlsProps {
  params: ImageGenerationParams;
  onParamsChange: (params: Partial<ImageGenerationParams>) => void;
  selectedModel?: {
    modelId: string;
    supportsMultipleImages?: boolean;
  };
  lastGeneratedImageSeed?: number;
  disabled?: boolean;
  onReset?: () => void;
}

const ImageGenerationControlsDesktop = ({
  params,
  onParamsChange,
  selectedModel,
  lastGeneratedImageSeed,
  disabled = false,
  onReset,
}: ImageGenerationControlsProps) => {
  // Simple wrapper function - React Compiler will optimize if needed
  const handleChange = (
    field: keyof ImageGenerationParams,
    value: string | number | undefined
  ) => {
    onParamsChange({ [field]: value });
  };

  const handleReuseLastSeed = () => {
    if (lastGeneratedImageSeed !== undefined) {
      handleChange("seed", lastGeneratedImageSeed);
    }
  };

  const hasAdvancedSettings = hasAdvancedImageSettings(params, selectedModel);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <h3 className="text-sm font-medium">Generation Settings</h3>
        {hasAdvancedSettings && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowCounterClockwise size={12} className="mr-1.5" />
            Reset
          </Button>
        )}
      </div>

      <div className="stack-lg pt-4">
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
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Seed</Label>
              {lastGeneratedImageSeed !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReuseLastSeed}
                  disabled={disabled || params.seed === lastGeneratedImageSeed}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Reuse last
                </Button>
              )}
            </div>
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
    </div>
  );
};

const ImageGenerationControlsMobile = ({
  params,
  onParamsChange,
  selectedModel,
  lastGeneratedImageSeed,
  disabled = false,
  onReset,
}: ImageGenerationControlsProps) => {
  // Simple wrapper function - React Compiler will optimize if needed
  const handleChange = (
    field: keyof ImageGenerationParams,
    value: string | number | undefined
  ) => {
    onParamsChange({ [field]: value });
  };

  const handleReuseLastSeed = () => {
    if (lastGeneratedImageSeed !== undefined) {
      handleChange("seed", lastGeneratedImageSeed);
    }
  };

  const hasAdvancedSettings = hasAdvancedImageSettings(params, selectedModel);

  return (
    <>
      {hasAdvancedSettings && (
        <div className="flex items-center justify-end mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={disabled}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowCounterClockwise size={12} className="mr-1.5" />
            Reset
          </Button>
        </div>
      )}

      <div className="stack-lg">
        {selectedModel?.supportsMultipleImages && (
          <>
            <div className="stack-md">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Output
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Number of Images</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={disabled || (params.count || 1) <= 1}
                    onClick={() =>
                      handleChange(
                        "count",
                        Math.max(1, (params.count || 1) - 1)
                      )
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
                    className="h-8 w-8 p-0"
                    disabled={disabled || (params.count || 1) >= 4}
                    onClick={() =>
                      handleChange(
                        "count",
                        Math.min(4, (params.count || 1) + 1)
                      )
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-border" />
          </>
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
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Seed</Label>
              {lastGeneratedImageSeed !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReuseLastSeed}
                  disabled={disabled || params.seed === lastGeneratedImageSeed}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Reuse last
                </Button>
              )}
            </div>
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
              className="h-9 text-sm"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export const ImageGenerationSettings = memo<ImageGenerationSettingsProps>(
  ({
    params,
    onParamsChange,
    selectedModel,
    lastGeneratedImageSeed,
    disabled = false,
    className = "",
  }) => {
    const isDesktop = useMediaQuery("(min-width: 640px)");
    const hasAdvancedSettings = hasAdvancedImageSettings(params, selectedModel);

    // Simple wrapper function - React Compiler will optimize if needed
    const handleReset = () => {
      onParamsChange(getImageSettingsResetParams(selectedModel));
    };

    const triggerContent = (
      <>
        <Gear className="h-4 w-4 text-current" />
        {isDesktop && <span className="hidden sm:inline">Settings</span>}
        {hasAdvancedSettings && (
          <div className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
        )}
      </>
    );

    return (
      <div className={className}>
        <ResponsivePicker
          trigger={triggerContent}
          title="Image Generation Settings"
          tooltip="Open image generation settings"
          disabled={disabled}
          ariaLabel="Image generation settings"
          triggerClassName="relative"
          contentClassName={isDesktop ? "w-80 p-0" : ""}
          align="end"
          sideOffset={8}
        >
          {isDesktop ? (
            <ImageGenerationControlsDesktop
              params={params}
              onParamsChange={onParamsChange}
              selectedModel={selectedModel}
              lastGeneratedImageSeed={lastGeneratedImageSeed}
              disabled={disabled}
              onReset={handleReset}
            />
          ) : (
            <ImageGenerationControlsMobile
              params={params}
              onParamsChange={onParamsChange}
              selectedModel={selectedModel}
              lastGeneratedImageSeed={lastGeneratedImageSeed}
              disabled={disabled}
              onReset={handleReset}
            />
          )}
        </ResponsivePicker>
      </div>
    );
  }
);

ImageGenerationSettings.displayName = "ImageGenerationSettings";
