import type { Doc } from "@convex/_generated/dataModel";
import { memo, useMemo } from "react";
import { CommandGroup } from "@/components/ui/command";
import { ModelItem } from "./ModelItem";

// Union type for models returned by getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

const ModelListComponent = ({
  modelGroups,
  handleSelect,
  hasReachedPollyLimit,
  selectedModelId,
  itemSize = "sm",
}: {
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  handleSelect: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  selectedModelId?: string;
  itemSize?: "sm" | "md";
}) => {
  const { freeModels, providerGroups } = useMemo(() => {
    const groups: { provider: string; models: AvailableModel[] }[] = [];

    // Group models by provider
    Object.entries(modelGroups.providerModels).forEach(([provider, models]) => {
      if (models.length > 0) {
        groups.push({ provider, models });
      }
    });

    return {
      freeModels: modelGroups.freeModels,
      providerGroups: groups,
    };
  }, [modelGroups]);

  return (
    <>
      {freeModels.length > 0 && (
        <CommandGroup className="p-0">
          {freeModels.map((model: AvailableModel) => (
            <ModelItem
              key={model.modelId}
              model={model}
              onSelect={() => handleSelect(model.modelId, model.provider)}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isSelected={selectedModelId === model.modelId}
              size={itemSize}
            />
          ))}
        </CommandGroup>
      )}

      {providerGroups.map(({ provider, models }) => (
        <CommandGroup key={provider} className="p-0">
          {models.map((model: AvailableModel) => (
            <ModelItem
              key={model.modelId}
              model={model}
              onSelect={() => handleSelect(model.modelId, model.provider)}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isSelected={selectedModelId === model.modelId}
              size={itemSize}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  );
};

export const ModelList = memo(ModelListComponent);
