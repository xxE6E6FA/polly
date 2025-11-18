import { Robot } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useState } from "react";
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
// import { useSelectedModel } from "@/hooks/use-selected-model";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
// unified tabs render handles items
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useSelectModel } from "@/hooks/use-select-model";
// import { CACHE_KEYS, get } from "@/lib/local-storage";
// capabilities handled in unified list component
import { useUserDataContext } from "@/providers/user-data-context";
import { ModelPickerTabs } from "../model-picker/Tabs";

// local AvailableModel type not required; unified components handle types

interface ModelDrawerProps {
  disabled?: boolean;
}

const ModelDrawerComponent = ({ disabled = false }: ModelDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");
  const { user } = useUserDataContext();
  const { modelGroups } = useModelCatalog();
  // const [selectedModelRaw] = useSelectedModel();
  const enabledImageModels = useEnabledImageModels() || [];
  const [generationMode, setGenerationMode] = useGenerationMode();
  const { params: imageParams, setParams: setImageParams } = useImageParams();

  const { selectModel } = useSelectModel();

  // selectedModel available if needed later for UI affordances
  // const selectedModel = selectedModelRaw;

  const handleSelect = useCallback(
    async (modelId: string, provider: string) => {
      setOpen(false);
      setGenerationMode("text");
      await selectModel(modelId, provider, [
        ...modelGroups.freeModels,
        ...Object.values(modelGroups.providerModels).flat(),
      ]);
    },
    [selectModel, modelGroups, setGenerationMode]
  );

  const handleSelectImage = useCallback(
    (modelId: string) => {
      setImageParams(prev => ({ ...prev, model: modelId }));
      setGenerationMode("image");
      setOpen(false);
    },
    [setImageParams, setGenerationMode]
  );

  useEffect(() => {
    setActiveTab(generationMode === "image" ? "image" : "text");
  }, [generationMode]);

  // Selected model persistence is handled by useSelectModel and upstream hooks

  if (user?.isAnonymous) {
    return (
      <Drawer>
        <DrawerTrigger>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-auto gap-1.5 px-2 py-0.5 text-xs font-medium sm:hidden"
            disabled={disabled}
          >
            <Robot className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Model</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Select Model</DrawerTitle>
          </DrawerHeader>
          <div className="p-6">
            <div className="text-center">
              <p className="mb-2 text-sm text-muted-foreground">
                Sign in to access models
              </p>
              <p className="text-xs text-muted-foreground">
                Anonymous users can only use Polly models
              </p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Select model"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-muted/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Robot className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Select Model</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="stack-md">
          <ModelPickerTabs
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            modelGroups={modelGroups}
            onSelectTextModel={handleSelect}
            hasReachedPollyLimit={false}
            imageModels={enabledImageModels}
            selectedImageModelId={imageParams.model || undefined}
            onSelectImageModel={handleSelectImage}
            size="md"
            autoFocusSearch={open}
          />
          {/* Custom image model input */}
          {activeTab === "image" && (
            <div className="stack-md">
              <Label className="text-sm font-medium">Custom Model ID</Label>
              <Input
                value={
                  enabledImageModels.find(
                    m => m.modelId === (imageParams.model || "")
                  )
                    ? ""
                    : imageParams.model || ""
                }
                onChange={e =>
                  setImageParams(prev => ({ ...prev, model: e.target.value }))
                }
                placeholder="e.g., user/model-name"
                className="h-9"
              />
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export const ModelDrawer = memo(ModelDrawerComponent);
