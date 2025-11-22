import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { shallow, useShallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";

type UserModel = Doc<"userModels">;
type BuiltInModel = Doc<"builtInModels">;
type AvailableModel = UserModel | BuiltInModel;

type Provider = string;

type ModelGroups = {
  freeModels: AvailableModel[];
  providerModels: Record<Provider, AvailableModel[]>;
};

export type CatalogState = {
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
      const key = m.provider;
      if (!providerModels[key]) {
        providerModels[key] = [];
      }
      providerModels[key]?.push(m);
    }
  }
  return { freeModels, providerModels };
};

type CatalogStoreApi = StoreApi<CatalogState>;

const createCatalogState = (
  set: CatalogStoreApi["setState"],
  _get: CatalogStoreApi["getState"]
): CatalogState => ({
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
});

export const createModelCatalogStore = () =>
  createStore<CatalogState>()((set, get) => createCatalogState(set, get));

let modelCatalogStoreApi: CatalogStoreApi = createModelCatalogStore();

type CatalogSelector<T> = (state: CatalogState) => T;

type UseModelCatalogStore = {
  <T>(selector: CatalogSelector<T>, equalityFn?: (a: T, b: T) => boolean): T;
  getState: CatalogStoreApi["getState"];
  setState: CatalogStoreApi["setState"];
  subscribe: CatalogStoreApi["subscribe"];
};

function useModelCatalogStoreBase<T>(
  selector: CatalogSelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    modelCatalogStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useModelCatalogStore = Object.assign(useModelCatalogStoreBase, {
  getState: () => modelCatalogStoreApi.getState(),
  setState: modelCatalogStoreApi.setState,
  subscribe: modelCatalogStoreApi.subscribe.bind(modelCatalogStoreApi),
}) as UseModelCatalogStore;

export const getModelCatalogStore = () => modelCatalogStoreApi;

export const setModelCatalogStoreApi = (store: CatalogStoreApi) => {
  modelCatalogStoreApi = store;
};

export const resetModelCatalogStoreApi = () => {
  modelCatalogStoreApi = createModelCatalogStore();
};

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

/**
 * Hook to get the model title for a given model ID and provider.
 * Returns the model's display name (title) if found in the catalog,
 * otherwise falls back to the model ID.
 */
export function useModelTitle(modelId?: string, provider?: string): string {
  const userModels = useModelCatalogStore(s => s.userModels);

  if (!modelId) {
    return "Assistant";
  }

  // Find the model in the catalog
  const model = userModels.find(
    m => m.modelId === modelId && m.provider === provider
  );

  // Return the model's name (title) if found, otherwise fall back to modelId
  return model?.name || modelId;
}
