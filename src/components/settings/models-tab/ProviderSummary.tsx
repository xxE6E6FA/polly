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
      className={`w-full cursor-pointer rounded-lg border p-4 text-left transition-all duration-200 hover:shadow-sm ${
        isSelected
          ? "border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20"
          : "border-border bg-background hover:bg-muted/50"
      }`}
      onClick={() => onToggle(provider)}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ProviderIcon provider={provider} className="h-8 w-8 shrink-0" />
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
    </button>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
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

    return (
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
