import {
  CaretDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { PROVIDER_NAMES } from "@shared/provider-constants";
import { memo, useCallback } from "react";
import { ProviderIcon } from "@/components/provider-icons";
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
import { getAllCapabilities } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import type { FilterState } from "./";

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
  }: ModelFiltersProps) => {
    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchChange(e.target.value);
      },
      [onSearchChange]
    );

    const allCapabilities = getAllCapabilities();

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

        <div className="flex shrink-0 gap-2">
          <Button
            disabled={isPending}
            size="sm"
            variant={filterState.showOnlySelected ? "secondary" : "outline"}
            className={cn(
              "gap-2 h-9 text-sm",
              filterState.showOnlySelected &&
                "bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
            )}
            onClick={onShowSelectedToggle}
          >
            Selected
            {filterState.showOnlySelected &&
              enabledModelsCount !== undefined && (
                <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-white/20 dark:text-white">
                  {enabledModelsCount}
                </span>
              )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="min-w-[120px] justify-start gap-2 h-9"
                disabled={isPending}
                size="sm"
                variant="outline"
              >
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
            <DropdownMenuTrigger asChild>
              <Button className="gap-1.5 h-9" size="sm" variant="outline">
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
        </div>
      </div>
    );
  }
);

ModelFilters.displayName = "ModelFilters";
