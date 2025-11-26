import type { Doc } from "@convex/_generated/dataModel";
import { memo, useMemo } from "react";
import { DrawerModelItem } from "./drawer-model-item";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

const DrawerModelListComponent = ({
  modelGroups,
  handleSelect,
  hasReachedPollyLimit,
  selectedModelId,
  itemSize = "md",
  searchQuery,
}: {
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  handleSelect: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  selectedModelId?: string;
  itemSize?: "sm" | "md";
  searchQuery?: string;
}) => {
  const { freeModels, providerGroups } = useMemo(() => {
    const groups: { provider: string; models: AvailableModel[] }[] = [];

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

  const filteredData = useMemo(() => {
    if (!searchQuery || searchQuery.trim() === "") {
      return { freeModels, providerGroups };
    }

    const query = searchQuery.toLowerCase();
    const filterModels = (models: AvailableModel[]) =>
      models.filter(
        m =>
          m.name.toLowerCase().includes(query) ||
          m.modelId.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query)
      );

    const filteredFreeModels = filterModels(freeModels);
    const filteredProviderGroups = providerGroups
      .map(group => ({
        provider: group.provider,
        models: filterModels(group.models),
      }))
      .filter(group => group.models.length > 0);

    return {
      freeModels: filteredFreeModels,
      providerGroups: filteredProviderGroups,
    };
  }, [freeModels, providerGroups, searchQuery]);

  return (
    <>
      {filteredData.freeModels.length > 0 && (
        <div>
          {filteredData.freeModels.map((model: AvailableModel) => (
            <DrawerModelItem
              key={model.modelId}
              model={model}
              onSelect={() => handleSelect(model.modelId, model.provider)}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isSelected={selectedModelId === model.modelId}
              size={itemSize}
            />
          ))}
        </div>
      )}

      {filteredData.providerGroups.map(({ provider, models }) => (
        <div key={provider}>
          {models.map((model: AvailableModel) => (
            <DrawerModelItem
              key={model.modelId}
              model={model}
              onSelect={() => handleSelect(model.modelId, model.provider)}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isSelected={selectedModelId === model.modelId}
              size={itemSize}
            />
          ))}
        </div>
      ))}
    </>
  );
};

export const DrawerModelList = memo(DrawerModelListComponent);
