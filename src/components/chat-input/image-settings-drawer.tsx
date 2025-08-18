import { ArrowCounterClockwise, Sliders } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { ImageGenerationParams } from "@/types";
import {
  getImageSettingsResetParams,
  hasAdvancedImageSettings,
  ImageGenerationSettingsContent,
} from "./image-generation-settings";

interface ImageSettingsDrawerProps {
  params: ImageGenerationParams;
  onParamsChange: (updates: Partial<ImageGenerationParams>) => void;
  selectedModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
  };
  disabled?: boolean;
}

export function ImageSettingsDrawer({
  params,
  onParamsChange,
  selectedModel,
  disabled = false,
}: ImageSettingsDrawerProps) {
  const hasAdvancedSettings = hasAdvancedImageSettings(params, selectedModel);

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Image generation settings"
          className="h-9 w-9 p-0 rounded-full sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Sliders className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Image Generation Settings</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex items-center justify-end">
            {hasAdvancedSettings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onParamsChange(getImageSettingsResetParams(selectedModel))
                }
                disabled={disabled}
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
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
