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
    // Show done state if we have citations (search complete, but still processing)
    if (citations && citations.length > 0) {
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
      return `Found ${citations.length} ${sourceType}`;
    }

    // Active searching messages
    switch (feature) {
      case "answer":
        return "Finding the best answer to your question...";
      case "similar":
        return "Finding similar pages and resources...";
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
          return `Searching ${categoryLabels[category] || category} for relevant information...`;
        }
        return "Searching for relevant information...";
    }
  };

  const isDone = citations && citations.length > 0;

  return (
    <div className="text-sm text-muted-foreground py-2 space-y-1">
      <div className="flex items-center gap-2">
        {isDone ? (
          <svg
            className="h-3 w-3 text-green-600 dark:text-green-400"
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
        ) : (
          <Spinner className="h-3 w-3" />
        )}
        <span>{getSearchMessage()}</span>
      </div>
    </div>
  );
};
