import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/shallow";

type UserModel = Doc<"userModels">;
type BuiltInModel = Doc<"builtInModels">;
type AvailableModel = UserModel | BuiltInModel;

type Provider = string;

type ModelGroups = {
  freeModels: AvailableModel[];
  providerModels: Record<Provider, AvailableModel[]>;
};

type CatalogState = {
  initialized: boolean;
  userModels: AvailableModel[];
  modelGroups: ModelGroups;
  setCatalog: (models: AvailableModel[]) => void;
  clear: () => void;
};

const groupModels = (models: AvailableModel[]): ModelGroups => {
  const freeModels: AvailableModel[] = [];
  const providerModels: Record<Provider, AvailableModel[]> = {};
  for (const m of models) {
    // Treat models with free flag as free; otherwise group by provider
    const isFree = "free" in m && (m.free as boolean) === true;
    if (isFree) {
      freeModels.push(m);
    } else {
      const key = m.provider as string;
      if (!providerModels[key]) {
        providerModels[key] = [];
      }
      providerModels[key].push(m);
    }
  }
  return { freeModels, providerModels };
};

export const useModelCatalogStore = create<CatalogState>()(set => ({
  initialized: false,
  userModels: [],
  modelGroups: { freeModels: [], providerModels: {} },
  setCatalog: (models: AvailableModel[]) =>
    set({
      initialized: true,
      userModels: models,
      modelGroups: groupModels(models),
    }),
  clear: () =>
    set({
      initialized: false,
      userModels: [],
      modelGroups: { freeModels: [], providerModels: {} },
    }),
}));

export function useModelCatalog() {
  // Fetch enabled models (both user + built-in) reactively
  // Use existing queries observed in the app
  const enabledUserModels = useQuery(api.userModels.getUserModels, {});
  const enabledBuiltIns = useQuery(api.userModels.getBuiltInModels, {});

  const setCatalog = useModelCatalogStore(s => s.setCatalog);

  useEffect(() => {
    const userList = Array.isArray(enabledUserModels)
      ? (enabledUserModels as AvailableModel[])
      : [];
    const builtInList = Array.isArray(enabledBuiltIns)
      ? (enabledBuiltIns as AvailableModel[])
      : [];
    const combined = [...userList, ...builtInList];
    if (enabledUserModels !== undefined || enabledBuiltIns !== undefined) {
      setCatalog(combined);
    }
  }, [enabledUserModels, enabledBuiltIns, setCatalog]);

  return useModelCatalogStore(
    useShallow(s => ({
      initialized: s.initialized,
      userModels: s.userModels,
      modelGroups: s.modelGroups,
    }))
  );
}
