/** biome-ignore-all lint/suspicious/noArrayIndexKey: acceptable for skeletons */
import { api } from "@convex/_generated/api";
import { KeyIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import Fuse from "fuse.js";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import { VirtualizedModelList } from "@/components/models/virtualized-model-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/use-debounce";
import {
  generateCapabilityCounts,
  matchesCapabilityFilters,
} from "@/lib/model-capabilities";
import { isApiKeysArray, isUserModelsArray } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type { FetchedModel } from "@/types";
import { Alert, AlertDescription, AlertIcon } from "../../ui/alert";
import { SettingsHeader } from "../settings-header";
import { SectionHeader } from "../ui/section-header";
import { SettingsZeroState } from "../ui/settings-zero-state";
import { ActiveFilters } from "./active-filters";
import { ModelFilters } from "./model-filters";
import { ProviderSummary } from "./provider-summary";

export type FilterState = {
  searchQuery: string;
  selectedProviders: string[];
  selectedCapabilities: string[];
  showOnlySelected: boolean;
};

type FilterAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "TOGGLE_PROVIDER"; payload: string }
  | { type: "TOGGLE_CAPABILITY"; payload: string }
  | { type: "TOGGLE_SHOW_SELECTED" }
  | { type: "CLEAR_PROVIDERS" }
  | { type: "CLEAR_CAPABILITIES" }
  | { type: "CLEAR_ALL" };

const initialFilterState: FilterState = {
  searchQuery: "",
  selectedProviders: [],
  selectedCapabilities: [],
  showOnlySelected: false,
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload };
    case "TOGGLE_PROVIDER":
      return {
        ...state,
        selectedProviders: state.selectedProviders.includes(action.payload)
          ? state.selectedProviders.filter(p => p !== action.payload)
          : [...state.selectedProviders, action.payload],
      };
    case "TOGGLE_CAPABILITY":
      return {
        ...state,
        selectedCapabilities: state.selectedCapabilities.includes(
          action.payload
        )
          ? state.selectedCapabilities.filter(c => c !== action.payload)
          : [...state.selectedCapabilities, action.payload],
      };
    case "TOGGLE_SHOW_SELECTED":
      return { ...state, showOnlySelected: !state.showOnlySelected };
    case "CLEAR_PROVIDERS":
      return { ...state, selectedProviders: [] };
    case "CLEAR_CAPABILITIES":
      return { ...state, selectedCapabilities: [] };
    case "CLEAR_ALL":
      return initialFilterState;
    default:
      return state;
  }
}

function renderTextModelsContent(
  isLoading: boolean,
  filteredModels: FetchedModel[],
  hasActiveFilters: boolean,
  isPending: boolean,
  clearAllFilters: () => void
) {
  if (isLoading) {
    return (
      <div className="stack-md">
        {Array.from({ length: 2 }, (_, rowIdx) => (
          <div
            key={`model-row-skeleton-${rowIdx}`}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton
                key={`model-skeleton-${rowIdx}-${i}`}
                className="h-40 w-full rounded-lg"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (filteredModels.length > 0) {
    return <VirtualizedModelList models={filteredModels} />;
  }
  return (
    <SettingsZeroState
      icon={<MagnifyingGlassIcon className="size-12" />}
      title="No models found"
      description={
        hasActiveFilters
          ? "Try adjusting your search terms or filters to find what you're looking for."
          : "No models are available from your configured providers."
      }
      cta={
        hasActiveFilters ? (
          <Button
            disabled={isPending}
            variant="outline"
            onClick={clearAllFilters}
          >
            Clear all filters
          </Button>
        ) : undefined
      }
    />
  );
}

export const TextModelsTab = () => {
  const [filterState, dispatch] = useReducer(filterReducer, initialFilterState);
  const [isPending, startTransition] = useTransition();

  const deferredSearchQuery = useDeferredValue(filterState.searchQuery);
  const debouncedFilters = useDebounce(
    {
      ...filterState,
      searchQuery: deferredSearchQuery,
    },
    300
  );

  const { user } = useUserDataContext();
  const apiKeysRaw = useQuery(api.apiKeys.getUserApiKeys, user ? {} : "skip");
  const enabledModelsRaw = useQuery(
    api.userModels.getUserModels,
    user?._id ? {} : "skip"
  );

  // Apply type guards
  const apiKeys = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
  const enabledModels = isUserModelsArray(enabledModelsRaw)
    ? enabledModelsRaw
    : [];

  const availableProviders = useMemo(() => {
    const hasKey = (
      k: unknown
    ): k is {
      provider: string;
      hasKey?: boolean;
      encryptedKey?: unknown;
      clientEncryptedKey?: unknown;
    } => {
      if (k && typeof k === "object") {
        const obj = k as {
          hasKey?: boolean;
          encryptedKey?: unknown;
          clientEncryptedKey?: unknown;
        };
        if (typeof obj.hasKey === "boolean") {
          return obj.hasKey;
        }
        return Boolean(obj.encryptedKey || obj.clientEncryptedKey);
      }
      return false;
    };

    const blocked = new Set(["replicate", "elevenlabs"]);
    return apiKeys
      .filter(hasKey)
      .map(key => key.provider)
      .filter(p => !blocked.has(p.toLowerCase()));
  }, [apiKeys]);

  const enabledModelIds = useMemo(
    () => enabledModels.map(model => model.modelId),
    [enabledModels]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [unfilteredModels, setUnfilteredModels] = useState<FetchedModel[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Create a set of available model IDs from API-fetched models
  const availableModelIds = useMemo(() => {
    return new Set(unfilteredModels.map(model => model.modelId));
  }, [unfilteredModels]);

  // Separate available and unavailable user models based on API data
  const unavailableEnabledModels = useMemo(() => {
    return enabledModels.filter(model => !availableModelIds.has(model.modelId));
  }, [enabledModels, availableModelIds]);

  // Create unavailable model objects for display
  const unavailableForDisplay: FetchedModel[] = useMemo(() => {
    return unavailableEnabledModels.map(model => ({
      modelId: model.modelId,
      name: model.name,
      provider: model.provider,
      contextWindow: model.contextLength ?? 0,
      supportsReasoning: model.supportsReasoning ?? false,
      supportsTools: model.supportsTools ?? false,
      supportsImages: model.supportsImages ?? false,
      supportsFiles: model.supportsFiles ?? false,
      isAvailable: false,
    }));
  }, [unavailableEnabledModels]);

  // Combine all models for search
  const allModelsForSearch = useMemo(() => {
    return [...unfilteredModels, ...unavailableForDisplay];
  }, [unfilteredModels, unavailableForDisplay]);

  // Fuzzy search for models
  const fuse = useMemo(() => {
    return new Fuse(allModelsForSearch, {
      keys: ["modelId", "name", "provider"],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 2,
    });
  }, [allModelsForSearch]);

  const fuzzySearchResults = useMemo(() => {
    if (!debouncedFilters.searchQuery.trim()) {
      return unfilteredModels;
    }
    return fuse.search(debouncedFilters.searchQuery).map(result => result.item);
  }, [fuse, debouncedFilters.searchQuery, unfilteredModels]);

  const filteredModels = useMemo(() => {
    let result = fuzzySearchResults;

    if (debouncedFilters.selectedProviders.length > 0) {
      result = result.filter(model =>
        debouncedFilters.selectedProviders.includes(model.provider)
      );
    }

    if (debouncedFilters.selectedCapabilities.length > 0) {
      result = result.filter(model =>
        matchesCapabilityFilters(model, debouncedFilters.selectedCapabilities)
      );
    }

    if (debouncedFilters.showOnlySelected) {
      result = result.filter(model => enabledModelIds.includes(model.modelId));
    }

    // Separate unavailable and available models from search results
    const unavailable = result.filter(model => model.isAvailable === false);
    const available = result.filter(model => model.isAvailable !== false);

    // If no search query, include all unavailable models (filtered by other filters)
    const filteredUnavailable = debouncedFilters.searchQuery.trim()
      ? unavailable
      : unavailableForDisplay.filter(model => {
          if (debouncedFilters.selectedProviders.length > 0) {
            if (!debouncedFilters.selectedProviders.includes(model.provider)) {
              return false;
            }
          }
          if (debouncedFilters.selectedCapabilities.length > 0) {
            if (
              !matchesCapabilityFilters(
                model,
                debouncedFilters.selectedCapabilities
              )
            ) {
              return false;
            }
          }
          if (debouncedFilters.showOnlySelected) {
            if (!enabledModelIds.includes(model.modelId)) {
              return false;
            }
          }
          return true;
        });

    // Show unavailable models first, then available models
    return [...filteredUnavailable, ...available];
  }, [
    fuzzySearchResults,
    debouncedFilters,
    enabledModelIds,
    unavailableForDisplay,
  ]);

  const stats = useMemo(() => {
    if (unfilteredModels.length === 0) {
      return null;
    }

    const providerCounts: Record<string, number> = {};

    const capabilityCounts = generateCapabilityCounts(unfilteredModels);
    // Hide image generation capability in the Text Models tab
    (capabilityCounts as Record<string, number | undefined>)[
      "supportsImageGeneration"
    ] = undefined;

    for (const model of unfilteredModels) {
      providerCounts[model.provider] =
        (providerCounts[model.provider] || 0) + 1;
    }

    return { providerCounts, capabilityCounts };
  }, [unfilteredModels]);

  const hasActiveFilters = Boolean(
    filterState.searchQuery ||
      filterState.selectedProviders.length > 0 ||
      filterState.selectedCapabilities.length > 0 ||
      filterState.showOnlySelected
  );

  // Memoized action handlers to prevent unnecessary re-renders
  const handleSearchChange = useCallback((value: string) => {
    dispatch({ type: "SET_SEARCH", payload: value });
  }, []);

  const handleProviderToggle = useCallback((provider: string) => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_PROVIDER", payload: provider });
    });
  }, []);

  const handleCapabilityToggle = useCallback((capability: string) => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_CAPABILITY", payload: capability });
    });
  }, []);

  const handleShowSelectedToggle = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_SHOW_SELECTED" });
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "CLEAR_ALL" });
    });
  }, []);

  if (availableProviders.length === 0) {
    return (
      <div className="stack-xl">
        <SettingsHeader
          description="Configure your API keys to use different AI providers. Once you add API keys, models will be automatically fetched and displayed here."
          title="Text Models"
        />

        <SettingsZeroState
          icon={<KeyIcon className="size-12" />}
          title="No API keys configured"
          description="Add your API keys to see available models."
        />
      </div>
    );
  }

  return (
    <div className="stack-xl">
      {error && (
        <Alert className="mb-6" variant="danger">
          <AlertIcon variant="danger" />
          <AlertDescription>
            Failed to load models. Please refresh the page or try again later.
          </AlertDescription>
        </Alert>
      )}

      <div className="stack-xl">
        <SectionHeader title="Providers" />
        <ProviderSummary
          availableProviders={availableProviders}
          selectedProviders={filterState.selectedProviders}
          stats={stats}
          onProviderToggle={handleProviderToggle}
          isLoading={isLoading}
          isInitialLoad={isLoading && unfilteredModels.length === 0}
        />
      </div>

      <div className="stack-xl">
        <ModelFilters
          filterState={filterState}
          onSearchChange={handleSearchChange}
          onProviderToggle={handleProviderToggle}
          onCapabilityToggle={handleCapabilityToggle}
          onShowSelectedToggle={handleShowSelectedToggle}
          availableProviders={availableProviders}
          stats={stats}
          enabledModelsCount={enabledModels.length}
          isPending={isPending}
          onModelsFetched={setUnfilteredModels}
          onLoadingChange={setIsLoading}
          onError={setError}
        />

        <ActiveFilters
          filterState={filterState}
          onRemoveSearchFilter={() => handleSearchChange("")}
          onRemoveSelectedFilter={handleShowSelectedToggle}
          onRemoveProviderFilter={handleProviderToggle}
          onRemoveCapabilityFilter={handleCapabilityToggle}
          onClearAllFilters={clearAllFilters}
          isPending={isPending}
        />
      </div>

      <div className="stack-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredModels.length} model
            {filteredModels.length !== 1 ? "s" : ""}{" "}
            {hasActiveFilters ? "matching filters" : "available"}
          </p>
          {isPending && !isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Updating filters...
            </div>
          )}
        </div>

        {renderTextModelsContent(
          isLoading,
          filteredModels,
          hasActiveFilters,
          isPending,
          clearAllFilters
        )}
      </div>
    </div>
  );
};
