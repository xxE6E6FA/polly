import { PROVIDER_NAMES } from "@shared/provider-constants";
import { memo } from "react";
import { ProviderIcon } from "@/components/provider-icons";

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
    <button
      type="button"
      className={`w-full cursor-pointer rounded-lg p-4 text-left transition-all duration-200 shadow-sm hover:shadow motion-hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        isSelected
          ? "ring-1 ring-primary bg-primary/10 hover:bg-primary/15"
          : "ring-1 ring-border/30 bg-card hover:bg-muted/70"
      }`}
      onClick={() => onToggle(provider)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ProviderIcon provider={provider} className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium leading-tight break-words">
              {PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {count} model{count !== 1 ? "s" : ""} available
          </p>
          {isSelected && (
            <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              Filtered
            </span>
          )}
        </div>
      </div>
    </button>
  )
);

ProviderSummaryCard.displayName = "ProviderSummaryCard";

const ProviderSummaryCardSkeleton = memo(() => (
  <div className="rounded-lg bg-card p-4 shadow-sm ring-1 ring-border/30">
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 shrink-0 animate-pulse rounded bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      </div>
    </div>
  </div>
));

ProviderSummaryCardSkeleton.displayName = "ProviderSummaryCardSkeleton";

interface ProviderSummaryProps {
  availableProviders: string[];
  selectedProviders: string[];
  stats?: {
    providerCounts: Record<string, number>;
    capabilityCounts: Record<string, number>;
  } | null;
  onProviderToggle: (provider: string) => void;
  isLoading: boolean;
  isInitialLoad: boolean;
}

export const ProviderSummary = memo(
  ({
    availableProviders,
    selectedProviders,
    stats,
    onProviderToggle,
    isLoading,
    isInitialLoad,
  }: ProviderSummaryProps) => {
    if (isInitialLoad && isLoading && availableProviders.length > 0) {
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {availableProviders.map(provider => (
            <ProviderSummaryCardSkeleton key={provider} />
          ))}
        </div>
      );
    }

    if (
      !stats?.providerCounts ||
      Object.keys(stats.providerCounts).length === 0
    ) {
      return null;
    }

    const availableProvidersSet = new Set(availableProviders);

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {Object.entries(stats.providerCounts)
          .filter(([provider]) => availableProvidersSet.has(provider))
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
              isSelected={selectedProviders.includes(provider)}
              provider={provider}
              onToggle={onProviderToggle}
            />
          ))}
      </div>
    );
  }
);

ProviderSummary.displayName = "ProviderSummary";
