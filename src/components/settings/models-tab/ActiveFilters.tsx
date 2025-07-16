import { PROVIDER_NAMES } from "@shared/provider-constants";
import { ProviderIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import { CAPABILITY_REGISTRY } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import type { FilterState } from "./";

const FilterTag = ({
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
);

interface ActiveFiltersProps {
  filterState: FilterState;
  onRemoveSearchFilter: () => void;
  onRemoveSelectedFilter: () => void;
  onRemoveProviderFilter: (provider: string) => void;
  onRemoveCapabilityFilter: (capability: string) => void;
  onClearAllFilters: () => void;
  isPending: boolean;
}

export const ActiveFilters = ({
  filterState,
  onRemoveSearchFilter,
  onRemoveSelectedFilter,
  onRemoveProviderFilter,
  onRemoveCapabilityFilter,
  onClearAllFilters,
  isPending,
}: ActiveFiltersProps) => {
  const hasActiveFilters =
    filterState.searchQuery ||
    filterState.selectedProviders.length > 0 ||
    filterState.selectedCapabilities.length > 0 ||
    filterState.showOnlySelected;

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="mt-1 shrink-0 text-sm text-muted-foreground">
        Filters:
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {filterState.searchQuery && (
          <FilterTag
            className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
            onClick={onRemoveSearchFilter}
          >
            Search: &ldquo;{filterState.searchQuery}&rdquo;
          </FilterTag>
        )}
        {filterState.showOnlySelected && (
          <FilterTag
            className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
            onClick={onRemoveSelectedFilter}
          >
            Selected only
          </FilterTag>
        )}
        {filterState.selectedProviders.map(provider => (
          <FilterTag
            key={provider}
            className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
            onClick={() => onRemoveProviderFilter(provider)}
          >
            <ProviderIcon provider={provider} className="h-3 w-3" />
            <span className="max-w-[100px] truncate">
              {PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}
            </span>
          </FilterTag>
        ))}
        {filterState.selectedCapabilities.map(capability => {
          const capabilityInfo =
            CAPABILITY_REGISTRY[capability as keyof typeof CAPABILITY_REGISTRY];
          return (
            <FilterTag
              key={capability}
              className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
              onClick={() => onRemoveCapabilityFilter(capability)}
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
          onClick={onClearAllFilters}
        >
          Clear all
        </Button>
      </div>
    </div>
  );
};

ActiveFilters.displayName = "ActiveFilters";
