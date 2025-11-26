/** biome-ignore-all lint/suspicious/noArrayIndexKey: acceptable for skeletons */
import { api } from "@convex/_generated/api";
import {
  ArrowCounterClockwiseIcon,
  KeyIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import Fuse from "fuse.js";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/use-debounce";

import { isApiKeysArray } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { FetchedImageModel } from "@/types";
import { Alert, AlertDescription, AlertIcon } from "../../ui/alert";
import { SettingsHeader } from "../settings-header";
import { SettingsZeroState } from "../ui/settings-zero-state";
import { VirtualizedImageModelList } from "./virtualized-image-model-list";

type ImageModelResult = {
  modelId: string;
  name: string;
  provider: string;
  description: string;
  modelVersion: string;
  owner: string;
  tags: string[];
  supportedAspectRatios: string[];
  supportsUpscaling: boolean;
  supportsInpainting: boolean;
  supportsOutpainting: boolean;
  supportsImageToImage: boolean;
  supportsMultipleImages: boolean;
  supportsNegativePrompt: boolean;
  coverImageUrl?: string;
  exampleImages?: string[];
};

export type ImageFilterState = {
  searchQuery: string;
  showOnlySelected: boolean;
};

type ImageFilterAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "TOGGLE_SHOW_SELECTED" }
  | { type: "CLEAR_ALL" };

const initialImageFilterState: ImageFilterState = {
  searchQuery: "",
  showOnlySelected: false,
};

function imageFilterReducer(
  state: ImageFilterState,
  action: ImageFilterAction
): ImageFilterState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload };
    case "TOGGLE_SHOW_SELECTED":
      return { ...state, showOnlySelected: !state.showOnlySelected };
    case "CLEAR_ALL":
      return initialImageFilterState;
    default:
      return state;
  }
}

function getModelCountText(
  hasActiveFilters: boolean,
  searchMode: "local" | "api"
): string {
  if (hasActiveFilters) {
    if (searchMode === "api") {
      return "matching filters (API search)";
    }
    return "matching filters";
  }
  if (searchMode === "api") {
    return "from API search";
  }
  return "available";
}

function renderImageModelsContent(
  isLoading: boolean,
  isSearching: boolean,
  filteredModels: FetchedImageModel[],
  hasActiveFilters: boolean,
  isPending: boolean,
  clearAllFilters: () => void
) {
  if (isLoading || isSearching) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton
            key={`image-model-skeleton-${i}`}
            className="h-80 w-full rounded-lg"
          />
        ))}
      </div>
    );
  }
  if (filteredModels.length > 0) {
    return <VirtualizedImageModelList models={filteredModels} />;
  }
  return (
    <SettingsZeroState
      icon={<MagnifyingGlassIcon className="h-12 w-12" />}
      title="No image models found"
      description={
        hasActiveFilters
          ? "Try adjusting your search terms or filters to find what you're looking for."
          : "No image models are available from Replicate."
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

export const ImageModelsTab = () => {
  const [filterState, dispatch] = useReducer(
    imageFilterReducer,
    initialImageFilterState
  );
  const [isPending, startTransition] = useTransition();
  const [customModelId, setCustomModelId] = useState("");
  const [isAddingCustomModel, setIsAddingCustomModel] = useState(false);
  const [searchResults, setSearchResults] = useState<FetchedImageModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<"local" | "api">("local");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentSearchQueryRef = useRef<string>("");

  const deferredSearchQuery = useDeferredValue(filterState.searchQuery);
  const debouncedFilters = useDebounce(
    {
      ...filterState,
      searchQuery: deferredSearchQuery,
    },
    300
  );

  const { user } = useUserDataContext();
  const { success, error: showError } = useToast();
  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );
  const enabledImageModelsRaw = useQuery(
    api.imageModels.getUserImageModels,
    user?._id ? {} : "skip"
  );

  // Apply type guards
  const apiKeys = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
  const enabledImageModels = Array.isArray(enabledImageModelsRaw)
    ? enabledImageModelsRaw
    : [];

  // Get model definitions for user's selected models
  const selectedModelIds = enabledImageModels.map(model => model.modelId);
  const modelDefinitionsRaw = useQuery(
    api.imageModels.getModelDefinitions,
    selectedModelIds.length > 0 ? { modelIds: selectedModelIds } : "skip"
  );
  const modelDefinitions = Array.isArray(modelDefinitionsRaw)
    ? modelDefinitionsRaw
    : [];

  const hasReplicateKey = useMemo(() => {
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

    return apiKeys.filter(hasKey).some(key => key.provider === "replicate");
  }, [apiKeys]);

  // Simple array map - React Compiler will optimize if needed
  const enabledImageModelIds = enabledImageModels.map(model => model.modelId);

  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<FetchedImageModel[]>(
    []
  );
  const hasAttemptedLoadRef = useRef(false);
  const fetchReplicateImageModelsAction = useAction(
    api.imageModels.fetchReplicateImageModels
  );
  const searchReplicateModelsAction = useAction(
    api.imageModels.searchReplicateModels
  );
  const addCustomImageModelAction = useAction(
    api.imageModels.addCustomImageModel
  );
  const refreshModelCapabilitiesAction = useAction(
    api.imageModels.refreshModelCapabilities
  );

  // Search models using Replicate API
  const searchModels = useCallback(
    async (query: string) => {
      // Prevent duplicate searches for the same query
      if (currentSearchQueryRef.current === query) {
        return;
      }

      if (!hasReplicateKey) {
        return;
      }

      if (!query.trim()) {
        return;
      }

      currentSearchQueryRef.current = query;

      setIsSearching(true);
      try {
        const result = await searchReplicateModelsAction({ query });

        // Transform API results to FetchedImageModel format
        const transformedModels: FetchedImageModel[] = result.models.map(
          (model: ImageModelResult) => ({
            modelId: model.modelId,
            name: model.name,
            provider: model.provider,
            description: model.description,
            modelVersion: model.modelVersion,
            owner: model.owner,
            tags: model.tags,
            supportedAspectRatios: model.supportedAspectRatios,
            supportsUpscaling: model.supportsUpscaling,
            supportsInpainting: model.supportsInpainting,
            supportsOutpainting: model.supportsOutpainting,
            supportsImageToImage: model.supportsImageToImage,
            supportsMultipleImages: model.supportsMultipleImages,
            coverImageUrl: model.coverImageUrl,
            exampleImages: model.exampleImages,
          })
        );

        setSearchResults(transformedModels);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Failed to search models")
        );
      } finally {
        setIsSearching(false);
        currentSearchQueryRef.current = "";
      }
    },
    [hasReplicateKey, searchReplicateModelsAction]
  );

  // Fetch models from Replicate API directly
  const fetchModels = useCallback(async () => {
    if (!hasReplicateKey || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchReplicateImageModelsAction({});

      // Transform API results to FetchedImageModel format
      const transformedModels: FetchedImageModel[] = result.models.map(
        (model: ImageModelResult) => ({
          modelId: model.modelId,
          name: model.name,
          provider: model.provider,
          description: model.description,
          modelVersion: model.modelVersion,
          owner: model.owner,
          tags: model.tags,
          supportedAspectRatios: model.supportedAspectRatios,
          supportsUpscaling: model.supportsUpscaling,
          supportsInpainting: model.supportsInpainting,
          supportsOutpainting: model.supportsOutpainting,
          supportsImageToImage: model.supportsImageToImage,
          supportsMultipleImages: model.supportsMultipleImages,
          coverImageUrl: model.coverImageUrl,
          exampleImages: model.exampleImages,
        })
      );

      setAvailableModels(transformedModels);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch models")
      );
    } finally {
      setIsLoading(false);
    }
  }, [hasReplicateKey, isLoading, fetchReplicateImageModelsAction]);

  // Combine available models with user's selected models (including custom ones)
  const allModels = useMemo(() => {
    const modelMap = new Map<string, FetchedImageModel>();

    // In API search mode, only use search results if we have any
    if (searchMode === "api") {
      if (searchResults.length > 0) {
        searchResults.forEach(model => {
          modelMap.set(model.modelId, model);
        });
      }
      // If no search results in API mode, don't show any fetched models
    } else {
      // In local search mode, use the curated collection
      availableModels.forEach(model => {
        modelMap.set(model.modelId, model);
      });
    }

    // Only add user's selected models in local mode
    // In API mode, we only show search results
    if (searchMode === "local") {
      // Create a map of model definitions for quick lookup
      const definitionsMap = new Map(
        modelDefinitions
          .filter((def): def is NonNullable<typeof def> => def !== null)
          .map(def => [def.modelId, def])
      );

      // Add user's selected models (especially custom ones not in the collection)
      enabledImageModels.forEach(userModel => {
        if (modelMap.has(userModel.modelId)) {
          // Model exists in fetched models, but check if we can enhance it with stored definition
          const existingModel = modelMap.get(userModel.modelId);
          const fullDefinition = definitionsMap.get(userModel.modelId);

          if (existingModel && fullDefinition) {
            // Enhance the fetched model with stored rich metadata
            modelMap.set(userModel.modelId, {
              ...existingModel,
              coverImageUrl:
                fullDefinition.coverImageUrl || existingModel.coverImageUrl,
              exampleImages:
                fullDefinition.exampleImages || existingModel.exampleImages,
            });
          }
          return;
        }

        // Check if we have a full definition for this model
        const fullDefinition = definitionsMap.get(userModel.modelId);

        // This is a custom model not in the collection, add it
        const customModel: FetchedImageModel = {
          modelId: userModel.modelId,
          name: userModel.name,
          provider: userModel.provider,
          description: userModel.description,
          modelVersion: userModel.modelVersion,
          owner: userModel.owner,
          tags: userModel.tags,
          supportedAspectRatios: userModel.supportedAspectRatios,
          supportsUpscaling: userModel.supportsUpscaling,
          supportsInpainting: userModel.supportsInpainting,
          supportsOutpainting: userModel.supportsOutpainting,
          supportsImageToImage: userModel.supportsImageToImage,
          supportsMultipleImages: userModel.supportsMultipleImages,
          // Use rich metadata from full definition if available
          coverImageUrl: fullDefinition?.coverImageUrl,
          exampleImages: fullDefinition?.exampleImages,
        };
        modelMap.set(userModel.modelId, customModel);
      });
    }

    return Array.from(modelMap.values());
  }, [
    availableModels,
    searchResults,
    searchMode,
    enabledImageModels,
    modelDefinitions,
  ]);

  // Load models on mount if we have a Replicate key
  useEffect(() => {
    if (hasReplicateKey && !hasAttemptedLoadRef.current) {
      hasAttemptedLoadRef.current = true;
      fetchModels();
    }
  }, [hasReplicateKey, fetchModels]);

  // Trigger API search when search query changes in API mode
  useEffect(() => {
    if (searchMode === "api" && debouncedFilters.searchQuery.trim()) {
      searchModels(debouncedFilters.searchQuery);
    } else if (searchMode === "api" && !debouncedFilters.searchQuery.trim()) {
      // Clear search results when query is empty
      setSearchResults([]);
    }
  }, [searchMode, debouncedFilters.searchQuery, searchModels]);

  // Fuzzy search for models
  const fuse = useMemo(() => {
    return new Fuse(allModels, {
      keys: ["modelId", "name", "description", "owner"],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 2,
    });
  }, [allModels]);

  const fuzzySearchResults = useMemo(() => {
    // If in API search mode, don't apply fuzzy search since API already did the searching
    if (searchMode === "api") {
      return allModels;
    }

    // In local mode, apply fuzzy search only if there's a search query
    if (!debouncedFilters.searchQuery.trim()) {
      return allModels;
    }

    return fuse.search(debouncedFilters.searchQuery).map(result => result.item);
  }, [fuse, debouncedFilters.searchQuery, allModels, searchMode]);

  const filteredModels = useMemo(() => {
    let result = fuzzySearchResults;

    if (debouncedFilters.showOnlySelected) {
      result = result.filter(model =>
        enabledImageModelIds.includes(model.modelId)
      );
    }

    return result;
  }, [fuzzySearchResults, debouncedFilters, enabledImageModelIds]);

  const hasActiveFilters =
    Boolean(filterState.searchQuery) || filterState.showOnlySelected;

  // Memoized action handlers to prevent unnecessary re-renders
  const handleSearchChange = useCallback((value: string) => {
    dispatch({ type: "SET_SEARCH", payload: value });
  }, []);

  const handleSearchModeToggle = useCallback(() => {
    const newMode = searchMode === "local" ? "api" : "local";
    setSearchMode(newMode);

    // Clear search results when switching modes
    if (newMode === "local") {
      setSearchResults([]);
    }
  }, [searchMode]);

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

  const handleAddCustomModel = useCallback(async () => {
    if (!customModelId.trim()) {
      return;
    }

    setIsAddingCustomModel(true);
    try {
      const result = await addCustomImageModelAction({
        modelId: customModelId.trim(),
      });

      if (result.success) {
        setCustomModelId("");
        success(result.message);
      } else {
        showError(result.message);
      }
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to add custom model"
      );
    } finally {
      setIsAddingCustomModel(false);
    }
  }, [customModelId, addCustomImageModelAction, success, showError]);

  const handleRefreshCapabilities = useCallback(async () => {
    if (isRefreshing || enabledImageModels.length === 0) {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await refreshModelCapabilitiesAction();

      if (result.success) {
        success(result.message);
        if (result.errors) {
          // Show warnings for individual errors
          result.errors.forEach((error: string) => {
            console.warn("Model refresh error:", error);
          });
        }
      } else {
        showError("Failed to refresh model capabilities");
      }
    } catch (error) {
      console.error("Error refreshing capabilities:", error);
      showError(
        error instanceof Error
          ? error.message
          : "Failed to refresh model capabilities. Please try again."
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [
    isRefreshing,
    enabledImageModels.length,
    refreshModelCapabilitiesAction,
    success,
    showError,
  ]);

  const handleCustomModelKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddCustomModel();
      }
    },
    [handleAddCustomModel]
  );

  if (!hasReplicateKey) {
    return (
      <div className="stack-xl">
        <SettingsHeader
          description="Configure Replicate image generation models. Add your Replicate API key to see available models."
          title="Image Models"
        />

        <SettingsZeroState
          icon={<KeyIcon className="h-12 w-12" />}
          title="No Replicate API key configured"
          description="Add your Replicate API key to see available image generation models."
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
            Failed to load image models. Please refresh the page or try again
            later.
          </AlertDescription>
        </Alert>
      )}

      {/* Custom Model Input */}
      <div className="rounded-lg bg-muted/50 p-4 shadow-sm ring-1 ring-border/30">
        <h3 className="text-sm font-medium mb-2">Add Custom Model</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Enter a model ID from replicate.com (e.g., "stability-ai/sdxl" or
          "black-forest-labs/flux-dev")
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="owner/model-name"
            value={customModelId}
            onChange={e => setCustomModelId(e.target.value)}
            onKeyDown={handleCustomModelKeyPress}
            disabled={isAddingCustomModel}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            onClick={handleAddCustomModel}
            disabled={!customModelId.trim() || isAddingCustomModel}
          >
            {isAddingCustomModel ? (
              <>
                <Spinner className="h-3 w-3 mr-1" />
                Adding...
              </>
            ) : (
              "Add Model"
            )}
          </Button>
        </div>
      </div>

      <div className="stack-xl">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            placeholder={
              searchMode === "api"
                ? "Search all Replicate models..."
                : "Search curated models locally..."
            }
            value={filterState.searchQuery}
            onChange={handleSearchChange}
            className="min-w-0 flex-1"
          />

          <div className="flex shrink-0 gap-3 items-center">
            <Button
              size="sm"
              variant={filterState.showOnlySelected ? "default" : "secondary"}
              className="gap-2 h-9 text-sm"
              onClick={handleShowSelectedToggle}
            >
              Selected
              {filterState.showOnlySelected &&
                enabledImageModels.length > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs text-primary-foreground">
                    {enabledImageModels.length}
                  </span>
                )}
            </Button>

            <Button
              size="sm"
              variant="secondary"
              className="gap-2 h-9 text-sm"
              onClick={handleSearchModeToggle}
              title={
                searchMode === "api"
                  ? "Switch to local search of curated models"
                  : "Switch to API search of all Replicate models"
              }
            >
              {searchMode === "api" ? "API Search" : "Local Search"}
            </Button>

            {enabledImageModels.length > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    aria-label="Refresh model capabilities"
                    className="shrink-0 w-9 h-9"
                    disabled={isRefreshing}
                    size="icon"
                    variant="ghost"
                    onClick={handleRefreshCapabilities}
                  >
                    <ArrowCounterClockwiseIcon
                      className={`h-4 w-4 ${isRefreshing ? "animate-[spin_1s_linear_infinite_reverse]" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Refresh capabilities for enabled models
                </TooltipContent>
              </Tooltip>
            )}

            {hasActiveFilters && (
              <Button
                disabled={isPending}
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="stack-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredModels.length} model
              {filteredModels.length !== 1 ? "s" : ""}{" "}
              {getModelCountText(hasActiveFilters, searchMode)}
            </p>
            {isPending && !isLoading && !isSearching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Updating filters...
              </div>
            )}
          </div>

          {renderImageModelsContent(
            isLoading,
            isSearching,
            filteredModels,
            hasActiveFilters,
            isPending,
            clearAllFilters
          )}
        </div>
      </div>
    </div>
  );
};
