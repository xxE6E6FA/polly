import {
  useDeferredValue,
  useEffect,
  useCallback,
  memo,
  useState,
  useMemo,
  useReducer,
  useTransition,
} from "react";

import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";

import { ProviderIcon } from "@/components/provider-icons";
import { Spinner } from "@/components/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthenticatedUserId } from "@/hooks/use-authenticated-user-id";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";
import { VirtualizedModelList } from "../virtualized-model-list";
import { SettingsHeader } from "./settings-header";
import { Alert, AlertDescription, AlertIcon } from "../ui/alert";

const PROVIDER_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
} as const;

const CAPABILITY_FILTERS = [
  {
    key: "supportsReasoning",
    label: "Advanced Reasoning",
    description: "Chain-of-thought and complex reasoning",
  },
  {
    key: "supportsImages",
    label: "Vision",
    description: "Can analyze images and visual content",
  },
  {
    key: "supportsTools",
    label: "Tools",
    description: "Can call functions and use external tools",
  },
  {
    key: "supportsFiles",
    label: "File Upload",
    description: "Can process file uploads",
  },
  { key: "fast", label: "Fast", description: "Quick responses, lower latency" },
  {
    key: "coding",
    label: "Coding",
    description: "Excellent for programming tasks",
  },
  { key: "latest", label: "Latest", description: "Newest model version" },
] as const;

type FilterState = {
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

const ProviderSummaryCard = memo(
  ({
    provider,
    count,
    isSelected,
    onToggle,
  }: {
    provider: string;
    count: number;
    isSelected: boolean;
    onToggle: (provider: string) => void;
  }) => (
    <div
      className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 hover:shadow-sm ${
        isSelected
          ? "border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20"
          : "border-border bg-background hover:bg-muted/50"
      }`}
      onClick={() => onToggle(provider)}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <ProviderIcon provider={provider} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate text-base font-medium">
                {PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}
              </h3>
              {isSelected && (
                <span className="shrink-0 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-200">
                  Filtered
                </span>
              )}
            </div>
            <p className="m-0 text-sm text-muted-foreground">
              {count} model{count !== 1 ? "s" : ""} available
            </p>
          </div>
        </div>
      </div>
    </div>
  )
);

ProviderSummaryCard.displayName = "ProviderSummaryCard";

const ProviderSummaryCardSkeleton = memo(() => (
  <div className="rounded-lg border bg-background p-4">
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div className="mb-2 h-6 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  </div>
));

ProviderSummaryCardSkeleton.displayName = "ProviderSummaryCardSkeleton";

const FilterTag = memo(
  ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <button
      title="Click to remove filter"
      type="button"
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all cursor-pointer",
        "hover:bg-destructive/10 dark:hover:bg-destructive/20 hover:text-destructive hover:shadow-sm",
        className
      )}
      onClick={onClick}
    >
      {children}
      <span className="ml-1 text-xs opacity-60 hover:opacity-100">×</span>
    </button>
  )
);

FilterTag.displayName = "FilterTag";

const LoadingState = ({ message }: { message: string }) => {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="space-y-4 text-center">
        <Spinner className="mx-auto text-blue-500" size="lg" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export const ModelsTab = () => {
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

  const authenticatedUserId = useAuthenticatedUserId();
  const apiKeys = useQuery(api.apiKeys.getUserApiKeys);
  const enabledModels = useQuery(
    api.userModels.getUserModels,
    authenticatedUserId ? { userId: authenticatedUserId } : {}
  );

  const availableProviders = useMemo(
    () => apiKeys?.filter(key => key.hasKey).map(key => key.provider) || [],
    [apiKeys]
  );

  const enabledModelIds = useMemo(
    () => enabledModels?.map(model => model.modelId) || [],
    [enabledModels]
  );

  const fetchAllModels = useAction(api.models.fetchAllModels);
  const [unfilteredModels, setUnfilteredModels] = useState<
    Array<{
      modelId: string;
      name: string;
      provider: string;
      contextWindow: number;
      supportsReasoning: boolean;
      supportsTools: boolean;
      supportsImages: boolean;
      supportsFiles: boolean;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      if (availableProviders.length === 0) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const models = await fetchAllModels();
        setUnfilteredModels(models);
        setIsInitialLoad(false);
      } catch (error) {
        console.error("Failed to fetch models:", error);
        setError(error as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, [fetchAllModels, availableProviders]);

  const allModels = useMemo(() => {
    let filteredModels = unfilteredModels;

    if (debouncedFilters.searchQuery) {
      const searchLower = debouncedFilters.searchQuery.toLowerCase();
      filteredModels = filteredModels.filter(
        model =>
          model.modelId.toLowerCase().includes(searchLower) ||
          model.name.toLowerCase().includes(searchLower) ||
          model.provider.toLowerCase().includes(searchLower)
      );
    }

    if (debouncedFilters.selectedProviders.length > 0) {
      filteredModels = filteredModels.filter(model =>
        debouncedFilters.selectedProviders.includes(model.provider)
      );
    }

    if (debouncedFilters.selectedCapabilities.length > 0) {
      filteredModels = filteredModels.filter(model =>
        debouncedFilters.selectedCapabilities.every(capability => {
          switch (capability) {
            case "supportsReasoning":
              return model.supportsReasoning;
            case "supportsImages":
              return model.supportsImages;
            case "supportsTools":
              return model.supportsTools;
            case "supportsFiles":
              return model.supportsFiles;
            default:
              return false;
          }
        })
      );
    }

    return filteredModels;
  }, [unfilteredModels, debouncedFilters]);

  const models = useMemo(() => {
    if (!debouncedFilters.showOnlySelected) {
      return allModels;
    }
    return allModels.filter(model => enabledModelIds.includes(model.modelId));
  }, [allModels, debouncedFilters.showOnlySelected, enabledModelIds]);

  const stats = useMemo(() => {
    if (unfilteredModels.length === 0) {
      return null;
    }

    const providerCounts: Record<string, number> = {};
    const capabilityCounts: Record<string, number> = {};

    for (const model of unfilteredModels) {
      providerCounts[model.provider] =
        (providerCounts[model.provider] || 0) + 1;

      if (model.supportsReasoning) {
        capabilityCounts.supportsReasoning =
          (capabilityCounts.supportsReasoning || 0) + 1;
      }
      if (model.supportsImages) {
        capabilityCounts.supportsImages =
          (capabilityCounts.supportsImages || 0) + 1;
      }
      if (model.supportsTools) {
        capabilityCounts.supportsTools =
          (capabilityCounts.supportsTools || 0) + 1;
      }
      if (model.supportsFiles) {
        capabilityCounts.supportsFiles =
          (capabilityCounts.supportsFiles || 0) + 1;
      }
    }

    return { providerCounts, capabilityCounts };
  }, [unfilteredModels]);

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

  const clearFilters = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "CLEAR_ALL" });
    });
  }, []);

  const clearProviders = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "CLEAR_PROVIDERS" });
    });
  }, []);

  const clearCapabilities = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "CLEAR_CAPABILITIES" });
    });
  }, []);

  const handleRemoveSearchFilter = useCallback(() => {
    dispatch({ type: "SET_SEARCH", payload: "" });
  }, []);

  const handleRemoveSelectedFilter = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_SHOW_SELECTED" });
    });
  }, []);

  const handleRemoveProviderFilter = useCallback((provider: string) => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_PROVIDER", payload: provider });
    });
  }, []);

  const handleRemoveCapabilityFilter = useCallback((capability: string) => {
    startTransition(() => {
      dispatch({ type: "TOGGLE_CAPABILITY", payload: capability });
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    if (availableProviders.length === 0) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const models = await fetchAllModels();
      setUnfilteredModels(models);
    } catch (error) {
      console.error("Failed to refresh models:", error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllModels, availableProviders]);

  const hasActiveFilters = useMemo(
    () =>
      filterState.searchQuery ||
      filterState.selectedProviders.length > 0 ||
      filterState.selectedCapabilities.length > 0 ||
      filterState.showOnlySelected,
    [filterState]
  );

  if (apiKeys === undefined) {
    return <LoadingState message="Loading API keys..." />;
  }

  if (availableProviders.length === 0) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          description="Configure your API keys to use different AI providers. Once you add API keys, models will be automatically fetched and displayed here."
          title="Models"
        />

        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-muted">
          <div className="space-y-3 text-center">
            <div className="text-4xl text-muted-foreground/50">🧠</div>
            <p className="text-sm text-muted-foreground">
              No API keys configured. Add your API keys to see available models.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <SettingsHeader
          description="Browse and explore AI models from your configured providers. Enable models to use them in conversations."
          title="Models"
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

      {isInitialLoad && isLoading && availableProviders.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {availableProviders.map(provider => (
            <ProviderSummaryCardSkeleton key={provider} />
          ))}
        </div>
      ) : (
        stats?.providerCounts &&
        Object.keys(stats.providerCounts).length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Object.entries(stats.providerCounts)
              .sort(([a], [b]) => {
                const providerOrder = Object.keys(PROVIDER_NAMES);
                const aIndex = providerOrder.indexOf(a);
                const bIndex = providerOrder.indexOf(b);
                if (aIndex === -1 && bIndex === -1) {
                  return a.localeCompare(b);
                }
                if (aIndex === -1) {
                  return 1;
                }
                if (bIndex === -1) {
                  return -1;
                }
                return aIndex - bIndex;
              })
              .map(([provider, count]) => (
                <ProviderSummaryCard
                  key={provider}
                  count={count}
                  isSelected={filterState.selectedProviders.includes(provider)}
                  provider={provider}
                  onToggle={handleProviderToggle}
                />
              ))}
          </div>
        )
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search models by name, ID, or provider..."
              value={filterState.searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              disabled={isPending}
              size="sm"
              variant={filterState.showOnlySelected ? "secondary" : "outline"}
              className={cn(
                "gap-2",
                filterState.showOnlySelected &&
                  "bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
              )}
              onClick={handleShowSelectedToggle}
            >
              Selected
              {filterState.showOnlySelected && enabledModels && (
                <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-white/20 dark:text-white">
                  {enabledModels.length}
                </span>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="min-w-[120px] justify-start gap-2"
                  disabled={isPending}
                  size="sm"
                  variant="outline"
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <ProviderIcon provider="openai" />
                  </div>
                  <span className="hidden sm:inline">Providers</span>
                  <span className="sm:hidden">Prov</span>
                  {filterState.selectedProviders.length > 0 && (
                    <Badge className="ml-0.5 h-5 px-1.5" variant="secondary">
                      {filterState.selectedProviders.length}
                    </Badge>
                  )}
                  <CaretDownIcon className="ml-auto h-4 w-4 opacity-50 sm:ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter by Provider</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableProviders.map(provider => (
                  <DropdownMenuCheckboxItem
                    key={provider}
                    checked={filterState.selectedProviders.includes(provider)}
                    className="flex items-center gap-3"
                    onCheckedChange={() => handleProviderToggle(provider)}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <ProviderIcon provider={provider} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {
                          PROVIDER_NAMES[
                            provider as keyof typeof PROVIDER_NAMES
                          ]
                        }
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stats?.providerCounts?.[provider] || 0} models
                      </div>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
                {filterState.selectedProviders.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <Button
                        className="h-7 w-full text-xs"
                        size="sm"
                        variant="ghost"
                        onClick={clearProviders}
                      >
                        Clear providers
                      </Button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5" size="sm" variant="outline">
                  <FunnelIcon className="h-4 w-4 shrink-0" />
                  <span className="hidden text-xs sm:inline">Capabilities</span>
                  {filterState.selectedCapabilities.length > 0 && (
                    <Badge className="ml-0.5 h-5 px-1.5" variant="secondary">
                      {filterState.selectedCapabilities.length}
                    </Badge>
                  )}
                  <CaretDownIcon className="ml-auto h-4 w-4 opacity-50 sm:ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Filter by Capabilities</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  {CAPABILITY_FILTERS.map(capability => (
                    <DropdownMenuCheckboxItem
                      key={capability.key}
                      className="flex items-start gap-3 py-2"
                      checked={filterState.selectedCapabilities.includes(
                        capability.key
                      )}
                      onCheckedChange={() =>
                        handleCapabilityToggle(capability.key)
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{capability.label}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">
                          {capability.description}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {stats?.capabilityCounts?.[capability.key] || 0}{" "}
                          models
                        </div>
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
                {filterState.selectedCapabilities.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <Button
                        className="h-7 w-full text-xs"
                        size="sm"
                        variant="ghost"
                        onClick={clearCapabilities}
                      >
                        Clear capabilities
                      </Button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-start gap-2">
            <span className="mt-1 shrink-0 text-sm text-muted-foreground">
              Filters:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {filterState.searchQuery && (
                <FilterTag
                  className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                  onClick={handleRemoveSearchFilter}
                >
                  Search: &ldquo;{filterState.searchQuery}&rdquo;
                </FilterTag>
              )}
              {filterState.showOnlySelected && (
                <FilterTag
                  className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                  onClick={handleRemoveSelectedFilter}
                >
                  Selected only
                </FilterTag>
              )}
              {filterState.selectedProviders.map(provider => (
                <FilterTag
                  key={provider}
                  className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                  onClick={() => handleRemoveProviderFilter(provider)}
                >
                  <div className="flex h-3 w-3 items-center justify-center">
                    <ProviderIcon provider={provider} />
                  </div>
                  <span className="max-w-[100px] truncate">
                    {PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}
                  </span>
                </FilterTag>
              ))}
              {filterState.selectedCapabilities.map(capability => {
                const capabilityInfo = CAPABILITY_FILTERS.find(
                  c => c.key === capability
                );
                return (
                  <FilterTag
                    key={capability}
                    className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                    onClick={() => handleRemoveCapabilityFilter(capability)}
                  >
                    <span className="max-w-[120px] truncate">
                      {capabilityInfo?.label}
                    </span>
                  </FilterTag>
                );
              })}
              <Button
                className="h-7 shrink-0 px-3 text-xs"
                disabled={isPending}
                size="sm"
                variant="ghost"
                onClick={clearFilters}
              >
                Clear all
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {models.length} model{models.length !== 1 ? "s" : ""}{" "}
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
        ) : models.length > 0 ? (
          <VirtualizedModelList models={models} />
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="max-w-md space-y-4 text-center">
              <div className="mb-4 text-6xl opacity-20">🔍</div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No models found</h3>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Try adjusting your search terms or filters to find what you're looking for."
                    : "No models are available from your configured providers."}
                </p>
              </div>
              {hasActiveFilters && (
                <Button
                  className="mt-4"
                  disabled={isPending}
                  variant="outline"
                  onClick={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
