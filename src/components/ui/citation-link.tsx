import { PreviewCard } from "@base-ui-components/react/preview-card";
import React, { useMemo } from "react";
import { useCitations } from "@/providers/citation-context";
import type { WebSearchCitation } from "@/types";
import { CitationPill, CitationPillSkeleton } from "./citation-pill";
import type { Citation } from "./citation-popover";
import { CitationPreviewPopup } from "./citation-popover";
import { useIsStreaming } from "./streaming-markdown";

/**
 * Refactored CitationLink:
 * - Uses PreviewCard primitives for hover preview instead of custom Popover.
 * - Ensures hooks are not conditionally skipped (no early return before hooks).
 * - Maps WebSearchCitation -> internal Citation shape.
 * - Falls back to a plain anchor for non-citation links or missing data.
 */
export const CitationLink: React.FC<React.ComponentPropsWithoutRef<"a">> =
  React.memo(({ href, children, ...props }) => {
    const { citations } = useCitations();
    const isStreaming = useIsStreaming();
    const isCitationRef = href?.startsWith("#cite-");

    // Map raw WebSearchCitation objects to internal Citation shape up-front.
    const mapped: Citation[] = useMemo(
      () =>
        citations.map((c: WebSearchCitation) => ({
          url: c.url,
          title: c.title,
          favicon: c.favicon,
          siteName: c.siteName,
          description: c.description || c.snippet,
        })),
      [citations]
    );

    // Derive grouped / single citation list (empty array if not a citation ref).
    const groupCitations: Citation[] = useMemo(() => {
      if (!(isCitationRef && href)) {
        return [];
      }
      const isGroup = href.includes("#cite-group-");
      if (isGroup) {
        const groupId = href.replace("#cite-group-", "");
        const citationNumbers = groupId
          .split("-")
          .map(n => parseInt(n, 10))
          .filter(n => !Number.isNaN(n));
        return citationNumbers
          .map(n => (n > 0 && n <= mapped.length ? mapped[n - 1] : null))
          .filter((c): c is Citation => c != null);
      }
      const citationNumber = parseInt(href.split("-").pop() || "0", 10);
      const single =
        citationNumber > 0 && citationNumber <= mapped.length
          ? mapped[citationNumber - 1]
          : null;
      return single ? [single] : [];
    }, [href, isCitationRef, mapped]);

    // Non-citation: render plain anchor before any citation-specific logic.
    if (!isCitationRef) {
      return (
        <a {...props} href={href}>
          {children}
        </a>
      );
    }

    // No valid citation(s): show skeleton during streaming, fallback anchor otherwise.
    if (groupCitations.length === 0) {
      if (isStreaming) {
        // Show skeleton pill during streaming - citation data will arrive when complete
        const citationText =
          typeof children === "string" ? children : String(children);
        return <CitationPillSkeleton citationText={citationText} />;
      }
      // After streaming, keep legacy anchor for edge cases
      return (
        <a {...props} href={href} className="citation-link">
          {children}
        </a>
      );
    }

    const pillCitation = groupCitations[0];
    if (!pillCitation) {
      if (isStreaming) {
        const citationText =
          typeof children === "string" ? children : String(children);
        return <CitationPillSkeleton citationText={citationText} />;
      }
      return (
        <a {...props} href={href} className="citation-link">
          {children}
        </a>
      );
    }

    const sourceName =
      pillCitation.siteName ||
      (() => {
        try {
          return new URL(pillCitation.url).hostname.replace(/^www\./, "");
        } catch {
          return "website";
        }
      })();

    return (
      <PreviewCard.Root>
        <PreviewCard.Trigger
          href={pillCitation.url}
          className="inline-flex align-baseline no-underline hover:no-underline"
          style={{ textDecoration: "none" }}
          onClick={e => {
            // Preserve scroll-to behavior instead of navigation.
            e.preventDefault();
            const citationId = href?.slice(1);
            if (!citationId) {
              return;
            }
            const element = document.getElementById(citationId);
            if (!element) {
              return;
            }
            try {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch {
              /* noop */
            }
          }}
        >
          <CitationPill
            sourceName={sourceName}
            groupCount={groupCitations.length}
            className="hover:text-foreground hover:bg-muted"
          />
        </PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner
            side="bottom"
            align="center"
            sideOffset={8}
            className="z-popover pointer-events-none data-[open]:pointer-events-auto"
          >
            <PreviewCard.Popup
              className="citation-preview w-80 rounded-xl border border-border/50 bg-popover shadow-xl transition-transform transition-opacity duration-200 data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]"
              data-citation-group={groupCitations.length > 1 ? "true" : "false"}
            >
              <CitationPreviewPopup citations={groupCitations} />
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    );
  });

CitationLink.displayName = "CitationLink";
