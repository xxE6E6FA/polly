import type { Doc } from "@convex/_generated/dataModel";
import { memo, useMemo } from "react";
import { ModelItem } from "./ModelItem";

// Union type for models returned by getAvailableModels
type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

const ModelListComponent = ({
  modelGroups,
  handleSelect,
  hasReachedPollyLimit,
  searchQuery = "",
  selectedModelId,
}: {
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  handleSelect: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  searchQuery?: string;
  selectedModelId?: string;
}) => {
  const orderedModels = useMemo(() => {
    const providerModels = Object.values(modelGroups.providerModels).flat();
    const allModels = [...modelGroups.freeModels, ...providerModels];

    if (!searchQuery) {
      return allModels;
    }

    const lowerQuery = searchQuery.toLowerCase();
    return allModels.filter(
      m =>
        m.name.toLowerCase().includes(lowerQuery) ||
        m.modelId.toLowerCase().includes(lowerQuery) ||
        m.provider.toLowerCase().includes(lowerQuery)
    );
  }, [modelGroups, searchQuery]);

  return (
    <div className="flex flex-col">
      {orderedModels.length === 0 ? (
        <div className="p-6 text-center">
          <p className="mb-2 text-sm text-muted-foreground">No models found</p>
          <p className="text-xs text-muted-foreground">
            Try adjusting your search terms
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {orderedModels.map((model: AvailableModel) => (
            <ModelItem
              key={model.modelId}
              model={model}
              onSelect={() => handleSelect(model.modelId, model.provider)}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isSelected={selectedModelId === model.modelId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ModelList = memo(ModelListComponent);
