import type { Doc } from "@convex/_generated/dataModel";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
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
  autoFocusSearch,
}: {
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  handleSelect: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  autoFocusSearch?: boolean;
}) => {
  const orderedModels = useMemo(() => {
    const providerModels = Object.values(modelGroups.providerModels).flat();
    return [...modelGroups.freeModels, ...providerModels];
  }, [modelGroups]);

  return (
    <Command className="flex h-full min-h-0 w-full flex-1 flex-col rounded-none [&_[cmdk-input-wrapper]]:sticky [&_[cmdk-input-wrapper]]:top-0 [&_[cmdk-input-wrapper]]:z-10 [&_[cmdk-input-wrapper]]:mx-0 [&_[cmdk-input-wrapper]]:mb-0 [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input-wrapper]]:rounded-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40 [&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-2 [&_[cmdk-input-wrapper]]:shadow-sm dark:[&_[cmdk-input-wrapper]]:bg-muted/20 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:mr-2 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground [&_[cmdk-input]]:h-9 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:rounded-none [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-sm">
      <CommandInput
        className="w-full rounded-none"
        placeholder="Search models..."
        autoFocus={autoFocusSearch}
      />
      <CommandList className="max-h-[min(calc(100dvh-14rem),260px)] overflow-y-auto">
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

        {orderedModels.length === 0 ? (
          <div className="p-6 text-center">
            <p className="mb-2 text-sm text-muted-foreground">
              No models available
            </p>
            <p className="text-xs text-muted-foreground">
              Add API keys and configure models in Settings
            </p>
          </div>
        ) : (
          <CommandGroup className="p-0">
            {orderedModels.map((model: AvailableModel) => (
              <ModelItem
                key={model.modelId}
                model={model}
                onSelect={() => handleSelect(model.modelId, model.provider)}
                hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};

export const ModelList = memo(ModelListComponent);
