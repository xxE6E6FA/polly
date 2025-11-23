import { GearIcon, Image, Plus } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/lib/routes";
import { DrawerItem } from "./drawer-item";

interface ImageModelDrawerProps {
  model: string;
  onModelChange: (model: string) => void;
  enabledImageModels:
    | Array<{
        modelId: string;
        name: string;
        description?: string;
        supportsMultipleImages?: boolean;
        supportsNegativePrompt?: boolean;
      }>
    | undefined;
  disabled?: boolean;
}

export function ImageModelDrawer({
  model,
  onModelChange,
  enabledImageModels,
  disabled = false,
}: ImageModelDrawerProps) {
  const [customModel, setCustomModel] = useState("");

  const handleModelSelect = useCallback(
    (selectedModel: string) => {
      onModelChange(selectedModel);
      setCustomModel("");
    },
    [onModelChange]
  );

  const models = enabledImageModels || [];

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="chat-input"
          size="sm"
          aria-label="Select image model"
          className="h-9 w-9 p-0 sm:hidden bg-muted/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Image className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Select Image Model</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="stack-xl">
          {/* Model List */}
          <div className="stack-lg">
            {models.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No image models available
              </div>
            ) : (
              <div className="stack-sm">
                {models.map(imageModel => (
                  <DrawerItem
                    key={imageModel.modelId}
                    icon={<Image className="h-4 w-4" />}
                    name={imageModel.name}
                    description={imageModel.description || imageModel.modelId}
                    badges={
                      <>
                        {imageModel.supportsMultipleImages && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs">
                            <Plus className="h-3 w-3" />
                            Multi-image
                          </span>
                        )}
                        {imageModel.supportsNegativePrompt && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
                            <Image className="h-3 w-3" />
                            Negative prompt
                          </span>
                        )}
                      </>
                    }
                    selected={model === imageModel.modelId}
                    onClick={() => handleModelSelect(imageModel.modelId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Custom Model Input */}
          <div className="stack-md">
            <Label className="text-sm font-medium">Custom Model ID</Label>
            <div className="stack-sm">
              <Input
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                placeholder="Enter custom model ID (e.g., dall-e-3)"
                className="h-9"
              />
              <div className="text-xs text-muted-foreground">
                Use this for models not in your list or custom endpoints
              </div>
            </div>
          </div>

          {/* Settings Link */}
          <div className="pt-2">
            <Link
              to={ROUTES.SETTINGS.IMAGE_MODELS}
              className="flex items-center justify-center gap-2 w-full p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors shadow-sm"
            >
              <GearIcon className="h-4 w-4" />
              <span className="text-sm">Manage Image Models</span>
            </Link>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
