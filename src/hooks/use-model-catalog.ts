import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { shallow, useShallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import type { HydratedModel } from "@/types";

// Models from queries are hydrated with capabilities from models.dev
type AvailableModel = HydratedModel;

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
  const { isAuthenticated } = useConvexAuth();

  // Skip query until auth is ready to prevent pre-auth results (built-in only)
  // from overwriting the localStorage cache with incomplete data.
  const availableModels = useQuery(
    api.userModels.getAvailableModels,
    isAuthenticated ? {} : "skip"
  ) as AvailableModel[] | undefined;

  const setCatalog = useModelCatalogStore(s => s.setCatalog);
  const initialized = useModelCatalogStore(s => s.initialized);

  // Initialize from localStorage cache on first render for instant display
  useEffect(() => {
    if (!initialized) {
      const cached = get<AvailableModel[] | null>(
        CACHE_KEYS.modelCatalog,
        null
      );
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setCatalog(cached);
      }
    }
  }, [initialized, setCatalog]);

  // Update store and cache when fresh data arrives
  useEffect(() => {
    if (Array.isArray(availableModels)) {
      setCatalog(availableModels);
      // Cache for instant display on next visit
      set(CACHE_KEYS.modelCatalog, availableModels);
    }
  }, [availableModels, setCatalog]);

  return useModelCatalogStore(
    useShallow(s => ({
      initialized: s.initialized,
      userModels: s.userModels,
      modelGroups: s.modelGroups,
    }))
  );
}

/**
 * Formats a model ID into a human-readable display name.
 * e.g., "owner/my-model-name" -> "My Model Name"
 */
function formatModelDisplayName(modelId: string): string {
  // Extract the model name part (after the slash, or the whole thing if no slash)
  const parts = modelId.split("/");
  const modelName = parts[parts.length - 1] || modelId;

  // Replace hyphens/underscores with spaces and capitalize each word
  return modelName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bSdxl\b/gi, "SDXL")
    .replace(/\bSd\b/g, "SD")
    .replace(/\bFlux\b/gi, "FLUX")
    .replace(/\bV(\d)/gi, "V$1")
    .trim();
}

/**
 * Hook to get the model title for a given model ID and provider.
 * Returns the model's display name (title) if found in the catalog,
 * otherwise formats the model ID into a readable name.
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

  // Return the model's name (title) if found
  if (model?.name) {
    return model.name;
  }

  // For Replicate image models or unknown models, format the ID nicely
  return formatModelDisplayName(modelId);
}
