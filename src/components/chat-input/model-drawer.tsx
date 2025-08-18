import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Robot } from "@phosphor-icons/react";
import { PROVIDER_CONFIG } from "@shared/provider-constants";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  SelectableListItem,
  SelectableListItemIcon,
} from "@/components/ui/selectable-list-item";
import { useModelSelection } from "@/lib/chat/use-model-selection";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { getModelCapabilities } from "@/lib/model-capabilities";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

interface ModelDrawerProps {
  disabled?: boolean;
}

const ModelDrawerComponent = ({ disabled = false }: ModelDrawerProps) => {
  const [open, setOpen] = useState(false);
  const { user } = useUserDataContext();
  const { modelGroups } = useModelSelection();
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const managedToast = useToast();

  const selectedModel = selectedModelRaw;

  const handleSelect = useCallback(
    async (modelId: string, provider: string) => {
      setOpen(false);

      const selectedModelData = [
        ...modelGroups.freeModels,
        ...Object.values(modelGroups.providerModels).flat(),
      ].find(
        model => model?.modelId === modelId && model?.provider === provider
      );

      if (selectedModelData) {
        set(CACHE_KEYS.selectedModel, selectedModelData);
      }

      try {
        await selectModelMutation({ modelId, provider });
      } catch (_error) {
        managedToast.error("Failed to select model", {
          description: "Unable to change the selected model. Please try again.",
        });
      }
    },
    [selectModelMutation, modelGroups, managedToast.error]
  );

  const fallbackModel = useMemo(() => {
    if (selectedModel || user?.isAnonymous) {
      return null;
    }
    return get(CACHE_KEYS.selectedModel, null);
  }, [selectedModel, user?.isAnonymous]);

  const displayModel = selectedModel || fallbackModel;

  // Function to convert model to capabilities format
  const convertModelForCapabilities = useCallback(
    (model: AvailableModel) => ({
      modelId: model.modelId,
      provider: model.provider,
      name: model.name,
      contextLength: model.contextLength,
      supportsReasoning: model.supportsReasoning,
      supportsImages: model.supportsImages,
      supportsTools: model.supportsTools,
      supportsFiles: model.supportsFiles,
      inputModalities: model.inputModalities,
    }),
    []
  );

  // Function to get display name for model
  const getModelDisplayName = useCallback((model: AvailableModel) => {
    // Use model name if available, otherwise use modelId
    if (model.name && model.name !== model.modelId) {
      return model.name;
    }

    // Clean up modelId for display
    const cleanId = model.modelId
      .replace(/^gpt-/, "")
      .replace(/^claude-/, "")
      .replace(/^gemini-/, "")
      .replace(/^llama-/, "")
      .replace(/^mistral-/, "");

    return cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
  }, []);

  useEffect(() => {
    if (selectedModel && !user?.isAnonymous) {
      set(CACHE_KEYS.selectedModel, selectedModel);
    }
  }, [selectedModel, user?.isAnonymous]);

  if (user?.isAnonymous) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
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
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Select model"
          className="h-9 w-9 p-0 rounded-full sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Robot className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Select Model</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {/* Model List */}
          <div className="space-y-3">
            {modelGroups.freeModels.length === 0 &&
            Object.keys(modelGroups.providerModels).length === 0 ? (
              <div className="p-6 text-center">
                <p className="mb-2 text-sm text-muted-foreground">
                  No models available
                </p>
                <p className="text-xs text-muted-foreground">
                  Add API keys and configure models in Settings
                </p>
              </div>
            ) : (
              <>
                {/* Free Models Group */}
                {modelGroups.freeModels.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground px-2">
                      Free Models
                    </div>
                    {modelGroups.freeModels.map((model: AvailableModel) => (
                      <SelectableListItem
                        key={model.modelId}
                        className="p-2 cursor-pointer"
                        onClick={() =>
                          handleSelect(model.modelId, model.provider)
                        }
                        selected={displayModel?.modelId === model.modelId}
                      >
                        <div className="flex items-center gap-2">
                          <SelectableListItemIcon>
                            <ProviderIcon
                              provider={model.provider}
                              className="h-4 w-4"
                            />
                          </SelectableListItemIcon>
                          <div className="text-left">
                            <div className="font-medium text-sm">
                              {getModelDisplayName(model)}
                            </div>
                            {/* Model Capabilities */}
                            {(() => {
                              const capabilities = getModelCapabilities(
                                convertModelForCapabilities(model)
                              );
                              if (capabilities.length > 0) {
                                return (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    {capabilities.map(cap => {
                                      const Icon = cap.icon;
                                      return (
                                        <div
                                          key={`${model.modelId}-${cap.label}`}
                                          className="flex items-center gap-1"
                                        >
                                          <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </SelectableListItem>
                    ))}
                  </div>
                )}

                {/* Provider Groups */}
                {Object.entries(modelGroups.providerModels).map(
                  ([providerId, models]) => {
                    const providerConfig =
                      PROVIDER_CONFIG[
                        providerId as keyof typeof PROVIDER_CONFIG
                      ];
                    const providerTitle = providerConfig?.title || providerId;

                    return (
                      <div key={providerId} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground px-2">
                          {providerTitle}
                        </div>
                        {models.map((model: AvailableModel) => (
                          <SelectableListItem
                            key={model.modelId}
                            className="p-2 cursor-pointer"
                            onClick={() =>
                              handleSelect(model.modelId, model.provider)
                            }
                            selected={displayModel?.modelId === model.modelId}
                          >
                            <div className="flex items-center gap-2">
                              <SelectableListItemIcon>
                                <ProviderIcon
                                  provider={model.provider}
                                  className="h-4 w-4"
                                />
                              </SelectableListItemIcon>
                              <div className="text-left">
                                <div className="font-medium text-sm">
                                  {getModelDisplayName(model)}
                                </div>
                                {/* Model Capabilities */}
                                {(() => {
                                  const capabilities = getModelCapabilities(
                                    convertModelForCapabilities(model)
                                  );
                                  if (capabilities.length > 0) {
                                    return (
                                      <div className="flex items-center gap-1.5 mt-1">
                                        {capabilities.map(cap => {
                                          const Icon = cap.icon;
                                          return (
                                            <div
                                              key={`${model.modelId}-${cap.label}`}
                                              className="flex items-center gap-1"
                                            >
                                              <Icon className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </SelectableListItem>
                        ))}
                      </div>
                    );
                  }
                )}
              </>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export const ModelDrawer = memo(ModelDrawerComponent);
