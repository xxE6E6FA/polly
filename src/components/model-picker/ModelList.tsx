import type { Doc } from "@convex/_generated/dataModel";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { PROVIDER_CONFIG } from "@shared/provider-constants";
import { memo } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";

import { ModelItem } from "./ModelItem";

// Union type for models returned by getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

const ModelListComponent = ({
  modelGroups,
  handleSelect,
  hasReachedPollyLimit,
}: {
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  handleSelect: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
}) => {
  return (
    <Command className="pt-2">
      <CommandInput className="h-9" placeholder="Search models..." />
      <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
        <CommandEmpty>
          <div className="p-4 text-center">
            <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="mb-1 text-sm text-muted-foreground">
              No models found
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search terms
            </p>
          </div>
        </CommandEmpty>

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
              <CommandGroup>
                <div className="flex items-center gap-2 px-2 py-1.5 opacity-75">
                  <ProviderIcon provider="polly" className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Polly
                  </span>
                </div>
                {modelGroups.freeModels.map((model: AvailableModel) => (
                  <ModelItem
                    key={model.modelId}
                    model={model}
                    onSelect={() => handleSelect(model.modelId, model.provider)}
                    hasReachedPollyLimit={hasReachedPollyLimit ?? false}
                  />
                ))}
                {Object.keys(modelGroups.providerModels).length > 0 && (
                  <div className="mx-2 my-1.5 h-px bg-border/50" />
                )}
              </CommandGroup>
            )}

            {/* Provider Groups */}
            {Object.entries(modelGroups.providerModels).map(
              ([providerId, models], providerIndex: number) => {
                const providerConfig =
                  PROVIDER_CONFIG[providerId as keyof typeof PROVIDER_CONFIG];
                const providerTitle = providerConfig?.title || providerId;

                return (
                  <CommandGroup key={providerId}>
                    <div className="flex items-center gap-2 px-2 py-1.5 opacity-75">
                      <ProviderIcon
                        provider={providerId}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {providerTitle}
                      </span>
                    </div>
                    {models.map((model: AvailableModel) => (
                      <ModelItem
                        key={model.modelId}
                        model={model}
                        onSelect={() =>
                          handleSelect(model.modelId, model.provider)
                        }
                        hasReachedPollyLimit={hasReachedPollyLimit ?? false}
                      />
                    ))}
                    {providerIndex <
                      Object.keys(modelGroups.providerModels).length - 1 && (
                      <div className="mx-2 my-1.5 h-px bg-border/50" />
                    )}
                  </CommandGroup>
                );
              }
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
};

export const ModelList = memo(ModelListComponent);
