import { CaretRightIcon, LinkIcon } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";

type CitationsProps = {
  citations: WebSearchCitation[];
  className?: string;
  messageId?: string;
  content?: string;
  activeDuration?: number; // Make active highlight duration configurable
};

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "website";
  }
};

export const Citations = ({
  citations,
  className,
  messageId,
  content,
  activeDuration = 3000,
}: CitationsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [citedIndices, setCitedIndices] = useState<Set<number>>(new Set());
  const citationRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const observerRef = useRef<MutationObserver | null>(null);
  const rafIdRef = useRef<number>(0);

  // Scan for citation links
  const scanForCitations = useCallback(() => {
    if (!messageId) {
      return;
    }

    const messageContainer = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (messageContainer) {
      const citationLinks =
        messageContainer.querySelectorAll('a[href^="#cite-"]');
      const usedIndices = new Set<number>();

      citationLinks.forEach(link => {
        const href = link.getAttribute("href");
        const citationNumber = href
          ? parseInt(href.split("-").pop() || "")
          : null;
        if (citationNumber && citationNumber <= citations.length) {
          usedIndices.add(citationNumber - 1); // Convert to 0-based index
        }
      });

      // Fallback: parse raw message content if DOM links not present yet
      if (usedIndices.size === 0 && content) {
        const regex = /\[(\d+)\]/g;
        let match: RegExpExecArray | null = regex.exec(content);
        while (match !== null) {
          const capture = match[1];
          if (capture) {
            const num = parseInt(capture, 10);
            if (!Number.isNaN(num) && num >= 1 && num <= citations.length) {
              usedIndices.add(num - 1);
            }
          }
          match = regex.exec(content);
        }
      }

      setCitedIndices(usedIndices);
    }
  }, [messageId, citations.length, content]);

  // Use requestAnimationFrame for better performance
  const scheduleScanning = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      scanForCitations();
      rafIdRef.current = 0;
    });
  }, [scanForCitations]);

  // Set up citation detection
  useLayoutEffect(() => {
    if (!messageId) {
      return;
    }

    // Immediate scan if content exists
    scanForCitations();

    // Set up MutationObserver
    const messageContainer = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (messageContainer) {
      // Disconnect any existing observer
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      observerRef.current = new MutationObserver(mutations => {
        // Only schedule scanning if there are relevant mutations
        const hasRelevantMutations = mutations.some(
          mutation =>
            mutation.type === "childList" && mutation.addedNodes.length > 0
        );

        if (hasRelevantMutations) {
          scheduleScanning();
        }
      });

      observerRef.current.observe(messageContainer, {
        childList: true,
        subtree: true,
        // Remove characterData observer to reduce noise during streaming
      });
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [messageId, scheduleScanning, scanForCitations]);

  // Handle citation scrolling with IntersectionObserver
  const scrollToCitation = useCallback((citationNumber: number) => {
    const element = citationRefs.current[citationNumber - 1];
    if (!element) {
      return;
    }

    // Check if element is already in view
    const rect = element.getBoundingClientRect();
    const isInView =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;

    if (!isInView) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, []);

  // Handle citation clicks
  useEffect(() => {
    const handleCitationClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const citationLink = target.closest('a[href^="#cite-"]');

      if (citationLink) {
        const messageContainer = citationLink.closest("[data-message-id]");
        const clickedMessageId =
          messageContainer?.getAttribute("data-message-id");

        if (clickedMessageId !== messageId) {
          return;
        }

        const href = citationLink.getAttribute("href");
        const citationNumber = href
          ? parseInt(href.split("-").pop() || "")
          : null;

        if (citationNumber && citationNumber <= citations.length) {
          event.preventDefault();

          // Clear any existing timer
          if (activeTimerRef.current) {
            clearTimeout(activeTimerRef.current);
          }

          // Expand and highlight
          setIsExpanded(true);
          setActiveCitation(citationNumber);

          // Use requestAnimationFrame for scroll timing
          requestAnimationFrame(() => {
            scrollToCitation(citationNumber);
          });

          // Set timer to remove active state
          activeTimerRef.current = setTimeout(() => {
            setActiveCitation(null);
          }, activeDuration);
        }
      }
    };

    document.addEventListener("click", handleCitationClick, true);

    return () => {
      document.removeEventListener("click", handleCitationClick, true);
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
      }
    };
  }, [citations.length, messageId, scrollToCitation, activeDuration]);

  if (!citations || citations.length === 0) {
    return null;
  }

  // Filter citations based on whether we're showing all or just cited ones
  const displayedCitations = showAllSources
    ? citations
    : citations.filter((_, index) => citedIndices.has(index));

  // Calculate counts for display
  const citedCount = citedIndices.size;
  const totalCount = citations.length;

  // Always show citations if they exist, even if not explicitly referenced in text
  // This ensures web search sources are always visible to users

  return (
    <div ref={containerRef} className={cn("mt-4", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
        aria-expanded={isExpanded}
        aria-controls={`citations-${messageId}`}
      >
        <CaretRightIcon
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
          aria-hidden="true"
        />
        <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium">
          {citedCount > 0 && citedCount < totalCount ? (
            <>
              {citedCount} cited
              {!showAllSources && ` of ${totalCount}`} sources
            </>
          ) : (
            <>
              {totalCount} source{totalCount === 1 ? "" : "s"}
            </>
          )}
        </span>
      </button>

      {isExpanded && (
        <div
          id={`citations-${messageId}`}
          className="mt-3 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="stack-sm">
            {displayedCitations.map((citation, _displayIndex) => {
              // Find the original index in the full citations array
              const originalIndex = citations.indexOf(citation);
              const citationNumber = originalIndex + 1;

              return (
                <div
                  key={citation.url || `citation-${originalIndex}`}
                  ref={el => {
                    citationRefs.current[originalIndex] = el;
                  }}
                  data-citation-index={originalIndex}
                  id={`cite-${messageId}-${citationNumber}`}
                  className={cn(
                    "group flex items-start gap-2.5 p-2 -mx-2 rounded-md transition-all duration-200",
                    activeCitation === citationNumber &&
                      "bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium text-muted-foreground bg-muted rounded-full flex-shrink-0 mt-0.5">
                    {citationNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <div className="font-medium line-clamp-1 group-hover/link:underline selectable-text">
                        {citation.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 selectable-text">
                        {getDomain(citation.url)}
                      </div>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {citedCount > 0 && citedCount < totalCount && (
            <button
              onClick={() => setShowAllSources(!showAllSources)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllSources
                ? "Show only cited sources"
                : `Show all ${totalCount} sources searched`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
