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
          usedIndices.add(citationNumber - 1);
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

  if (!isExpanded) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "mt-3 animate-in slide-in-from-top-2 duration-200",
        className
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displayedCitations.map((citation, _displayIndex) => {
          const originalIndex = citations.indexOf(citation);
          const citationNumber = originalIndex + 1;

          return (
            <div
              key={citation.url || `citation-${originalIndex}`}
              ref={el => {
                citationRefs.current[originalIndex] = el;
              }}
              data-citation-index={originalIndex}
              id={`cite-${citationNumber}`}
              className={cn(
                "group relative rounded-lg border border-border bg-card p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-sm",
                activeCitation === citationNumber &&
                  "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/20"
              )}
            >
              <div className="stack-sm">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[10px] font-semibold text-primary bg-primary/10 rounded-full flex-shrink-0">
                    {citationNumber}
                  </span>
                  {citation.favicon && (
                    <img
                      src={citation.favicon}
                      alt=""
                      className="h-4 w-4 mt-0.5 flex-shrink-0"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link"
                    >
                      <div className="font-medium text-sm line-clamp-2 text-foreground group-hover/link:text-primary group-hover/link:underline transition-colors">
                        {citation.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getDomain(citation.url)}
                      </div>
                    </a>
                  </div>
                </div>
                {citation.snippet && (
                  <p className="text-xs text-muted-foreground line-clamp-2 pl-8">
                    {citation.snippet}
                  </p>
                )}
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
  );
};
