import { Spinner } from "@/components/spinner";
import type { WebSearchCitation } from "@/types";

type SearchQueryProps = {
  feature?: string;
  category?: string;
  citations?: WebSearchCitation[];
  isLoading: boolean;
};

export const SearchQuery = ({
  feature,
  category,
  citations,
  isLoading,
}: SearchQueryProps) => {
  // Only render during loading state
  if (!isLoading) {
    return null;
  }

  // Get user-friendly search message based on feature type and state
  const getSearchMessage = () => {
    // Active searching messages
    switch (feature) {
      case "answer":
        return "Looking for a direct answer...";
      case "similar":
        return "Discovering similar pages...";
      default:
        if (category) {
          const categoryLabels: Record<string, string> = {
            news: "news articles",
            company: "company information",
            "research paper": "academic papers",
            github: "code repositories",
            tweet: "social media posts",
            pdf: "PDF documents",
            "financial report": "financial reports",
          };
          return `Finding the best ${categoryLabels[category] || category} for you...`;
        }
        return "Searching the web for relevant information...";
    }
  };

  const isDone = citations && citations.length > 0;

  const categoryLabels: Record<string, string> = {
    news: "news articles",
    company: "company information",
    "research paper": "academic papers",
    github: "code repositories",
    tweet: "social media posts",
    pdf: "PDF documents",
    "financial report": "financial reports",
  };

  const sourceType = category
    ? categoryLabels[category] || category
    : "sources";

  return (
    <div className="text-sm text-muted-foreground py-2 stack-sm">
      <div className="flex items-center gap-2">
        {isDone ? (
          <>
            <svg
              className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              Found {citations.length} {sourceType}
            </span>
            <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-300">
              {citations.length}
            </span>
          </>
        ) : (
          <>
            <Spinner className="h-3 w-3 flex-shrink-0" />
            <span>{getSearchMessage()}</span>
          </>
        )}
      </div>
    </div>
  );
};
