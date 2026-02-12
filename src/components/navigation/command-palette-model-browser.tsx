import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { ProviderIcon } from "@/components/models/provider-icons";
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { getModelCapabilities } from "@/lib/model-capabilities";
import type { ModelForCapabilities } from "@/types";
import type { DisplayModel } from "./command-palette-types";

type CommandPaletteModelBrowserProps = {
  modelsByProvider: Record<string, DisplayModel[]>;
  currentSelectedModel: { modelId: string; provider: string } | null;
  onSelectModel: (modelId: string, provider: string) => void;
};

export function CommandPaletteModelBrowser({
  modelsByProvider,
  currentSelectedModel,
  onSelectModel,
}: CommandPaletteModelBrowserProps) {
  return (
    <>
      {Object.entries(modelsByProvider).map(
        ([provider, models], providerIndex) => (
          <div key={provider}>
            {providerIndex > 0 && <CommandSeparator className="my-2" />}
            <CommandGroup
              heading={provider}
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
            >
              {models.map(model => {
                const isSelected =
                  currentSelectedModel?.modelId === model.modelId &&
                  currentSelectedModel?.provider === model.provider;

                const capabilities = getModelCapabilities(
                  model as ModelForCapabilities
                );

                return (
                  <CommandItem
                    key={`${model.provider}-${model.modelId}`}
                    value={`model-${model.provider}-${model.modelId}`}
                    onSelect={() =>
                      onSelectModel(model.modelId, model.provider)
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                  >
                    <ProviderIcon
                      provider={model.free ? "polly" : model.provider}
                      className="h-4 w-4 text-muted-foreground flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{model.name}</div>
                      {model.contextLength && (
                        <div className="text-xs text-muted-foreground">
                          {model.contextLength.toLocaleString()} tokens
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {capabilities.length > 0 &&
                        capabilities.map((capability, index) => {
                          const IconComponent = capability.icon;
                          return (
                            <div
                              key={`${model.modelId}-${capability.label}-${index}`}
                              className="flex h-4 w-4 items-center justify-center rounded-sm bg-muted/50"
                              title={capability.label}
                            >
                              <IconComponent className="size-2.5 text-muted-foreground" />
                            </div>
                          );
                        })}
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-success flex-shrink-0 ml-1" />
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        )
      )}
      {Object.keys(modelsByProvider).length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6">
          <MagnifyingGlassIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No models found</p>
        </div>
      )}
    </>
  );
}
