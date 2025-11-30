import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";

type CitationsGalleryProps = {
  citations: WebSearchCitation[];
  className?: string;
  messageId?: string;
  content?: string;
  activeDuration?: number;
  isExpanded: boolean;
};

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "website";
  }
};

export const CitationsGallery = ({
  citations,
  className,
  messageId,
  content,
  activeDuration = 3000,
  isExpanded,
}: CitationsGalleryProps) => {
  const [showAllSources, setShowAllSources] = useState(true);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [citedIndices, setCitedIndices] = useState<Set<number>>(new Set());
  const citationRefs = useRef<(HTMLElement | null)[]>([]);
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
          usedIndices.add(citationNumber - 1);
        }
      });

      // Fallback: parse raw message content if DOM links not present yet
      if (usedIndices.size === 0 && content) {
        for (const match of content.matchAll(/\[(\d+)\]/g)) {
          const capture = match[1];
          if (!capture) {
            continue;
          }

          const num = parseInt(capture, 10);
          if (!Number.isNaN(num) && num >= 1 && num <= citations.length) {
            usedIndices.add(num - 1);
          }
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

    scanForCitations();

    const messageContainer = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (messageContainer) {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      observerRef.current = new MutationObserver(mutations => {
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

  // Handle citation scrolling
  const scrollToCitation = useCallback((citationNumber: number) => {
    const element = citationRefs.current[citationNumber - 1];
    if (!element) {
      return;
    }

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

          if (activeTimerRef.current) {
            clearTimeout(activeTimerRef.current);
          }

          setActiveCitation(citationNumber);

          requestAnimationFrame(() => {
            scrollToCitation(citationNumber);
          });

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

  const displayedCitations = showAllSources
    ? citations
    : citations.filter((_, index) => citedIndices.has(index));

  const citedCount = citedIndices.size;
  const totalCount = citations.length;

  return (
    <div
      ref={containerRef}
      className={cn(
        "mt-3 transition-all duration-300 ease-out overflow-hidden",
        isExpanded
          ? "animate-in slide-in-from-top-2 opacity-100 max-h-[2000px]"
          : "opacity-0 max-h-0 pointer-events-none",
        className
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {displayedCitations.map((citation, _displayIndex) => {
          const originalIndex = citations.indexOf(citation);
          const citationNumber = originalIndex + 1;

          return (
            <a
              key={citation.url || `citation-${originalIndex}`}
              ref={el => {
                citationRefs.current[originalIndex] = el;
              }}
              data-citation-index={originalIndex}
              id={`cite-${citationNumber}`}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group relative rounded-xl border border-border/40 bg-card/50 p-3 transition-all duration-200 hover:bg-muted/50 hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 block",
                activeCitation === citationNumber &&
                  "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-start gap-3">
                {citation.favicon ? (
                  <img
                    src={citation.favicon}
                    alt=""
                    className="h-5 w-5 mt-0.5 flex-shrink-0 rounded-sm object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-5 w-5 mt-0.5 flex-shrink-0 rounded-sm bg-muted flex items-center justify-center text-muted-foreground">
                    <span className="text-[10px] font-bold uppercase">
                      {getDomain(citation.url).slice(0, 2)}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground/70 mb-0.5 truncate group-hover:text-muted-foreground transition-colors">
                    {getDomain(citation.url)}
                  </div>
                  <div className="font-medium text-sm line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors leading-snug">
                    {citation.title}
                  </div>
                </div>
              </div>
            </a>
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
  );
};
