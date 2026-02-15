import type { ConversationSearchResult } from "@/types";
import { SearchResultItem } from "./search-result-item";

type SearchResultsContentProps = {
  results: ConversationSearchResult[] | undefined;
  searchQuery: string;
  isLoading: boolean;
  isMobile: boolean;
  onCloseSidebar: () => void;
};

export const SearchResultsContent = ({
  results,
  searchQuery,
  isLoading,
  isMobile,
  onCloseSidebar,
}: SearchResultsContentProps) => {
  if (isLoading) {
    return (
      <div className="pt-3 pb-3">
        <SearchResultsSkeleton />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="px-2.5 pt-4 pb-3">
        <p className="text-xs text-sidebar-muted">No matching conversations</p>
      </div>
    );
  }

  return (
    <div className="pt-3 pb-3 stack-sm">
      {results.map(result => (
        <SearchResultItem
          key={result.conversationId}
          result={result}
          searchQuery={searchQuery}
          isMobile={isMobile}
          onCloseSidebar={onCloseSidebar}
        />
      ))}
    </div>
  );
};

const SearchResultsSkeleton = () => {
  return (
    <div className="stack-sm pl-2" data-testid="search-results-skeleton">
      <div className="h-8 animate-pulse rounded-lg bg-muted/40 px-2" />
      <div className="ml-3 stack-xs">
        <div className="h-5 w-4/5 animate-pulse rounded bg-muted/30" />
        <div className="h-5 w-3/5 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="h-8 animate-pulse rounded-lg bg-muted/40 px-2" />
      <div className="ml-3 stack-xs">
        <div className="h-5 w-4/5 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="h-8 animate-pulse rounded-lg bg-muted/40 px-2" />
    </div>
  );
};
