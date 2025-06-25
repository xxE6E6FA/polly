import { useState } from "react";
import {
  ArrowSquareOutIcon,
  GlobeIcon,
  CaretDownIcon,
  CaretUpIcon,
  CalendarIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";

interface CitationsProps {
  citations: WebSearchCitation[];
  className?: string;
  compact?: boolean;
}

export function Citations({
  citations,
  className,
  compact = false,
}: CitationsProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  if (!citations || citations.length === 0) {
    return null;
  }

  const handleCitationClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "website";
    }
  };

  const CitationCard = ({ citation }: { citation: WebSearchCitation }) => {
    const domain = getDomain(citation.url);
    const faviconUrl =
      citation.favicon ||
      `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;

    return (
      <a
        href={citation.url}
        onClick={e => handleCitationClick(e, citation.url)}
        className="block p-4 bg-background border border-border 
                   rounded-lg hover:border-accent-cyan/50 
                   transition-colors duration-200 cursor-pointer"
      >
        <div className="flex gap-4">
          {/* Image/Favicon Section */}
          {citation.image ? (
            <div className="shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted">
              <img
                src={citation.image}
                alt=""
                className="w-full h-full object-cover"
                onError={e => {
                  e.currentTarget.parentElement!.style.display = "none";
                }}
                loading="lazy"
              />
            </div>
          ) : (
            <div className="shrink-0 w-12 h-12 rounded-md bg-muted flex items-center justify-center">
              <img
                src={faviconUrl}
                alt=""
                className="w-6 h-6 object-contain"
                onError={e => {
                  // Replace with SVG icon on error
                  const parent = e.currentTarget.parentElement!;
                  parent.innerHTML = `
                    <svg class="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  `;
                }}
                loading="lazy"
              />
            </div>
          )}

          {/* Content Section */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-foreground line-clamp-2 text-sm">
                {citation.title}
              </h4>
              <ArrowSquareOutIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GlobeIcon className="w-3 h-3" />
                {citation.siteName || domain}
              </span>
              {citation.publishedDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {formatDate(citation.publishedDate)}
                </span>
              )}
              {citation.author && (
                <span className="flex items-center gap-1 truncate max-w-[150px]">
                  <UserIcon className="w-3 h-3" />
                  {citation.author}
                </span>
              )}
            </div>

            {/* Description */}
            {(citation.description || citation.snippet) && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {citation.description || citation.snippet}
              </p>
            )}

            {/* Quoted text */}
            {citation.cited_text &&
              citation.cited_text !== citation.snippet &&
              citation.cited_text !== citation.description && (
                <blockquote
                  className="mt-2 pl-3 border-l-2 border-accent-cyan/30 
                                     text-xs text-muted-foreground italic line-clamp-2"
                >
                  "{citation.cited_text}"
                </blockquote>
              )}
          </div>
        </div>
      </a>
    );
  };

  if (compact) {
    return (
      <div className={cn("mt-4 w-full", className)}>
        <button
          className="flex items-center justify-between w-full text-sm font-medium 
                     text-muted-foreground hover:text-foreground transition-colors duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4 text-accent-cyan" />
            <span>Web sources</span>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {citations.length}
            </span>
          </div>
          {isExpanded ? (
            <CaretUpIcon className="w-4 h-4" />
          ) : (
            <CaretDownIcon className="w-4 h-4" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-2">
            {citations.map((citation, index) => (
              <CitationCard
                key={citation.url || `citation-${index}`}
                citation={citation}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("mt-6 w-full", className)}>
      <div className="flex items-center gap-2 mb-4">
        <GlobeIcon className="w-4 h-4 text-accent-cyan" />
        <h3 className="text-sm font-medium text-foreground">
          Web Sources ({citations.length})
        </h3>
      </div>

      <div className="space-y-2">
        {citations.map((citation, index) => (
          <CitationCard
            key={citation.url || `citation-${index}`}
            citation={citation}
          />
        ))}
      </div>
    </div>
  );
}
