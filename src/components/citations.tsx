import { useState } from "react";

import {
  ArrowSquareOutIcon,
  CalendarIcon,
  CaretDownIcon,
  CaretUpIcon,
  GlobeIcon,
  UserIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";

type CitationsProps = {
  citations: WebSearchCitation[];
  className?: string;
  compact?: boolean;
};

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "website";
  }
};

const formatDate = (dateString?: string) => {
  if (!dateString) {
    return null;
  }
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

const handleCitationClick = (e: React.MouseEvent, url: string) => {
  e.preventDefault();
  window.open(url, "_blank", "noopener,noreferrer");
};

const CitationCard = ({ citation }: { citation: WebSearchCitation }) => {
  const domain = getDomain(citation.url);
  const faviconUrl =
    citation.favicon ||
    `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;

  return (
    <a
      href={citation.url}
      className="block cursor-pointer rounded-lg border border-border 
                 bg-background p-4 
                 transition-colors duration-200 hover:border-accent-cyan/50"
      onClick={e => handleCitationClick(e, citation.url)}
    >
      <div className="flex gap-4">
        {/* Image/Favicon Section */}
        {citation.image ? (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
            <img
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              src={citation.image}
              onError={e => {
                e.currentTarget.parentElement!.style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <img
              alt=""
              className="h-6 w-6 object-contain"
              loading="lazy"
              src={faviconUrl}
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
            />
          </div>
        )}

        {/* Content Section */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-medium text-foreground">
              {citation.title}
            </h4>
            <ArrowSquareOutIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          {/* Metadata */}
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GlobeIcon className="h-3 w-3" />
              {citation.siteName || domain}
            </span>
            {citation.publishedDate && (
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {formatDate(citation.publishedDate)}
              </span>
            )}
            {citation.author && (
              <span className="flex max-w-[150px] items-center gap-1 truncate">
                <UserIcon className="h-3 w-3" />
                {citation.author}
              </span>
            )}
          </div>

          {/* Description */}
          {(citation.description || citation.snippet) && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {citation.description || citation.snippet}
            </p>
          )}

          {/* Quoted text */}
          {citation.cited_text &&
            citation.cited_text !== citation.snippet &&
            citation.cited_text !== citation.description && (
              <blockquote
                className="mt-2 line-clamp-2 border-l-2 border-accent-cyan/30 
                                   pl-3 text-xs italic text-muted-foreground"
              >
                "{citation.cited_text}"
              </blockquote>
            )}
        </div>
      </div>
    </a>
  );
};

export const Citations = ({
  citations,
  className,
  compact = false,
}: CitationsProps) => {
  const [isExpanded, setIsExpanded] = useState(!compact);

  if (!citations || citations.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn("mt-4 w-full", className)}>
        <button
          className="flex w-full items-center justify-between text-sm font-medium 
                     text-muted-foreground transition-colors duration-200 hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <GlobeIcon className="h-4 w-4 text-accent-cyan" />
            <span>Web sources</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {citations.length}
            </span>
          </div>
          {isExpanded ? (
            <CaretUpIcon className="h-4 w-4" />
          ) : (
            <CaretDownIcon className="h-4 w-4" />
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
      <div className="mb-4 flex items-center gap-2">
        <GlobeIcon className="h-4 w-4 text-accent-cyan" />
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
};
