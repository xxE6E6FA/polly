import { api } from "@convex/_generated/api";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { PROVIDER_NAMES } from "@shared/provider-constants";
import { useAction } from "convex/react";
import { memo, useCallback, useEffect, useState } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAllCapabilities } from "@/lib/model-capabilities";
import type { FetchedModel } from "@/types";
import type { FilterState } from "./text-models-tab";

interface ModelFiltersProps {
  filterState: FilterState;
  onSearchChange: (value: string) => void;
  onProviderToggle: (provider: string) => void;
  onCapabilityToggle: (capability: string) => void;
  onShowSelectedToggle: () => void;
  availableProviders: string[];
  stats?: {
    providerCounts: Record<string, number>;
    capabilityCounts: Record<string, number>;
  } | null;
  enabledModelsCount?: number;
  isPending: boolean;
  onModelsFetched: (models: FetchedModel[]) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onError: (error: Error | null) => void;
}

export const ModelFilters = memo(
  ({
    filterState,
    onSearchChange,
    onProviderToggle,
    onCapabilityToggle,
    onShowSelectedToggle,
    availableProviders,
    stats,
    enabledModelsCount,
    isPending,
    onModelsFetched,
    onLoadingChange,
    onError,
  }: ModelFiltersProps) => {
    const fetchAllModelsAction = useAction(api.models.fetchAllModels);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
      setIsRefreshing(true);
      onLoadingChange(true);
      try {
        const models = await fetchAllModelsAction({});
        // Always exclude Replicate and ElevenLabs from Text Models listing
        const filtered = models.filter(
          m => !["replicate", "elevenlabs"].includes(m.provider.toLowerCase())
        );
        onModelsFetched(filtered);
        onError(null);
      } catch (e) {
        onError(e as Error);
      } finally {
        setIsRefreshing(false);
        onLoadingChange(false);
      }
    }, [fetchAllModelsAction, onModelsFetched, onLoadingChange, onError]);

    useEffect(() => {
      if (availableProviders.length > 0) {
        handleRefresh();
      }
    }, [availableProviders.length, handleRefresh]);

    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchChange(e.target.value);
      },
      [onSearchChange]
    );

    const allCapabilities = getAllCapabilities().filter(
      c => c.key !== "supportsImageGeneration"
    );

    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            className="pl-10 h-9"
            placeholder="Search models by name, ID, or provider..."
            value={filterState.searchQuery}
            onChange={handleSearchChange}
          />
        </div>

        <div className="flex shrink-0 gap-3 items-center">
          <Button
            disabled={isPending}
            size="sm"
            variant={filterState.showOnlySelected ? "default" : "secondary"}
            className="gap-2 h-9 text-sm"
            onClick={onShowSelectedToggle}
          >
            Selected
            {filterState.showOnlySelected &&
              enabledModelsCount !== undefined && (
                <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs text-primary-foreground">
                  {enabledModelsCount}
                </span>
              )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                className="min-w-[120px] justify-start gap-2 h-9 text-sm"
                disabled={isPending}
                size="sm"
                variant="secondary"
              >
                <span className="hidden sm:inline">Providers</span>
                <span className="sm:hidden">Prov</span>
                {filterState.selectedProviders.length > 0 && (
                  <Badge className="ml-0.5 h-5 px-1.5" variant="default">
                    {filterState.selectedProviders.length}
                  </Badge>
                )}
                <CaretDownIcon className="ml-auto h-4 w-4 opacity-50 sm:ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by Provider</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {availableProviders.map(provider => (
                <DropdownMenuCheckboxItem
                  key={provider}
                  checked={filterState.selectedProviders.includes(provider)}
                  className="flex items-center gap-3"
                  onCheckedChange={() => onProviderToggle(provider)}
                >
                  <ProviderIcon
                    provider={provider}
                    className="h-4 w-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stats?.providerCounts?.[provider] || 0} models
                    </div>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                className="gap-1.5 h-9 text-sm"
                size="sm"
                variant="secondary"
              >
                <FunnelIcon className="h-4 w-4 shrink-0" />
                <span className="hidden text-xs sm:inline">Capabilities</span>
                {filterState.selectedCapabilities.length > 0 && (
                  <Badge className="ml-0.5 h-5 px-1.5" variant="default">
                    {filterState.selectedCapabilities.length}
                  </Badge>
                )}
                <CaretDownIcon className="ml-auto h-4 w-4 opacity-50 sm:ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by Capabilities</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <div className="max-h-80 overflow-y-auto">
                {allCapabilities.map(capability => (
                  <DropdownMenuCheckboxItem
                    key={capability.key}
                    className="flex items-start gap-3 py-2"
                    checked={filterState.selectedCapabilities.includes(
                      capability.key
                    )}
                    onCheckedChange={() => onCapabilityToggle(capability.key)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{capability.label}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {capability.description}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {stats?.capabilityCounts?.[capability.key] || 0} models
                      </div>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger>
              <Button
                aria-label="Refresh models"
                className="shrink-0 w-9 h-9"
                disabled={isRefreshing}
                size="icon"
                variant="ghost"
                onClick={handleRefresh}
              >
                <ArrowCounterClockwiseIcon
                  className={`h-4 w-4 ${isRefreshing ? "animate-[spin_1s_linear_infinite_reverse]" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh models from all providers</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }
);

ModelFilters.displayName = "ModelFilters";
