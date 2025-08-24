import { api } from "@convex/_generated/api";
import {
  ArrowCounterClockwiseIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useAction, useMutation, useQuery } from "convex/react";
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
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";

import {
  generateCapabilityCounts,
  matchesCapabilityFilters,
} from "@/lib/model-capabilities";
import { isApiKeysArray, isUserModelsArray } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import type { FetchedModel } from "@/types";
import { Alert, AlertDescription, AlertIcon } from "../../ui/alert";
import { VirtualizedModelList } from "../../virtualized-model-list";
import { SettingsHeader } from "../settings-header";
import { SectionHeader } from "../ui/SectionHeader";
import { SettingsZeroState } from "../ui/SettingsZeroState";
import { ActiveFilters } from "./ActiveFilters";
import { ModelFilters } from "./ModelFilters";
import { ProviderSummary } from "./ProviderSummary";

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
  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );
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

    return apiKeys.filter(hasKey).map(key => key.provider);
  }, [apiKeys]);

  const enabledModelIds = useMemo(
    () => enabledModels.map(model => model.modelId),
    [enabledModels]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [unfilteredModels, setUnfilteredModels] = useState<FetchedModel[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchAllModelsAction = useAction(api.models.fetchAllModels);
  const removeUnavailableModels = useMutation(
    api.userModels.removeUnavailableModels
  );

  const fetchAllModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const models = await fetchAllModelsAction({});
      setUnfilteredModels(models);
      setIsInitialLoad(false);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllModelsAction]);

  // Create a set of available model IDs from API-fetched models
  const availableModelIds = useMemo(() => {
    return new Set(unfilteredModels.map(model => model.modelId));
  }, [unfilteredModels]);

  // Separate available and unavailable user models based on API data
  const unavailableEnabledModels = useMemo(() => {
    return enabledModels.filter(model => !availableModelIds.has(model.modelId));
  }, [enabledModels, availableModelIds]);

  // Fuzzy search for models
  const fuse = useMemo(() => {
    return new Fuse(unfilteredModels, {
      keys: ["modelId", "name", "provider"],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 2,
    });
  }, [unfilteredModels]);

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

    // Add unavailable user models first (only if no filters are active)
    if (
      !debouncedFilters.searchQuery.trim() &&
      debouncedFilters.selectedProviders.length === 0 &&
      debouncedFilters.selectedCapabilities.length === 0 &&
      !debouncedFilters.showOnlySelected
    ) {
      // Create unavailable model objects for display
      const unavailableForDisplay: FetchedModel[] =
        unavailableEnabledModels.map(model => ({
          modelId: model.modelId,
          name: model.name,
          provider: model.provider,
          contextWindow: model.contextLength || 0,
          supportsReasoning: model.supportsReasoning,
          supportsTools: model.supportsTools,
          supportsImages: model.supportsImages,
          supportsFiles: model.supportsFiles ?? false,
          isAvailable: false, // Custom property to mark as unavailable
        }));

      result = [...unavailableForDisplay, ...result];
    }

    return result;
  }, [
    fuzzySearchResults,
    debouncedFilters,
    enabledModelIds,
    unavailableEnabledModels,
  ]);

  const stats = useMemo(() => {
    if (unfilteredModels.length === 0) {
      return null;
    }

    const providerCounts: Record<string, number> = {};

    const capabilityCounts = generateCapabilityCounts(unfilteredModels);

    for (const model of unfilteredModels) {
      providerCounts[model.provider] =
        (providerCounts[model.provider] || 0) + 1;
    }

    return { providerCounts, capabilityCounts };
  }, [unfilteredModels]);

  const hasActiveFilters =
    filterState.searchQuery ||
    filterState.selectedProviders.length > 0 ||
    filterState.selectedCapabilities.length > 0 ||
    filterState.showOnlySelected;

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

  const handleRefresh = useCallback(async () => {
    if (availableProviders.length === 0) {
      return;
    }

    await fetchAllModels();
  }, [fetchAllModels, availableProviders]);

  useEffect(() => {
    const loadModels = async () => {
      if (availableProviders.length === 0) {
        return;
      }

      await fetchAllModels();
    };

    loadModels();
  }, [fetchAllModels, availableProviders]);

  if (availableProviders.length === 0) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          description="Configure your API keys to use different AI providers. Once you add API keys, models will be automatically fetched and displayed here."
          title="Text Models"
        />

        <SettingsZeroState
          icon={<KeyIcon className="h-12 w-12" />}
          title="No API keys configured"
          description="Add your API keys to see available models."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <SettingsHeader
          description="Browse and explore AI models from your configured providers. Enable models to use them in conversations."
          title="Text Models"
        />
        <Button
          aria-label="Refresh models"
          className="shrink-0 gap-2"
          disabled={isLoading}
          size="sm"
          variant="outline"
          onClick={handleRefresh}
        >
          <ArrowCounterClockwiseIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {error && (
        <Alert className="mb-6" variant="danger">
          <AlertIcon variant="danger" />
          <AlertDescription>
            Failed to load models. Please refresh the page or try again later.
          </AlertDescription>
        </Alert>
      )}

      <SectionHeader title="Providers" />
      <ProviderSummary
        availableProviders={availableProviders}
        selectedProviders={filterState.selectedProviders}
        stats={stats}
        onProviderToggle={handleProviderToggle}
        isLoading={isLoading}
        isInitialLoad={isInitialLoad}
      />

      <div className="space-y-4">
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

      <div className="space-y-4">
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

        {isLoading ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <Spinner className="text-blue-500" size="lg" />
          </div>
        ) : filteredModels.length > 0 ? (
          <VirtualizedModelList models={filteredModels} />
        ) : (
          <SettingsZeroState
            icon={<MagnifyingGlassIcon className="h-12 w-12" />}
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
        )}

        {/* Unavailable Models Section */}
        {unavailableEnabledModels.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Unavailable Models</h3>
                <p className="text-xs text-muted-foreground">
                  These models are no longer available from their providers and
                  can be removed.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const result = await removeUnavailableModels();
                    if (result.success) {
                      // Refresh the models list
                      await fetchAllModels();
                    }
                  } catch (error) {
                    console.error(
                      "Failed to remove unavailable models:",
                      error
                    );
                  }
                }}
                className="gap-2"
              >
                <TrashIcon className="h-4 w-4" />
                Remove All
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {unavailableEnabledModels.map(model => (
                <div
                  key={`${model.provider}-${model.modelId}`}
                  className="relative min-h-[120px] rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <h4 className="break-words text-sm font-medium leading-tight line-clamp-2 text-red-700 dark:text-red-300">
                        {model.name}
                      </h4>
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {model.provider}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
                        Unavailable
                      </span>
                    </div>
                  </div>
                  <div className="mt-auto text-xs text-red-600 dark:text-red-400">
                    Model ID: {model.modelId}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
