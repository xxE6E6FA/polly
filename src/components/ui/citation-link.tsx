import React, { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { useCitations } from "./citation-context";
import { CitationPill } from "./citation-pill";
import type { Citation } from "./citation-popover";
import { CitationPopoverContent } from "./citation-popover";

// Citation Link component for handling citation links vs regular links
export const CitationLink: React.FC<React.ComponentPropsWithoutRef<"a">> =
  React.memo(({ href, children, ...props }) => {
    const { citations } = useCitations();
    const [open, setOpen] = useState(false);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveringRef = useRef(false);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
      };
    }, []);

    const handleMouseEnter = useCallback(() => {
      isHoveringRef.current = true;
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setOpen(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
      isHoveringRef.current = false;
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }

      // Delay close to allow fade-out animation
      closeTimeoutRef.current = setTimeout(() => {
        if (!isHoveringRef.current) {
          setOpen(false);
        }
      }, 350); // 200ms animation + 150ms hover delay
    }, []);

    if (href?.startsWith("#cite-")) {
      // Get display name from citation (prefer siteName, fallback to domain)
      const getDisplayName = (citation: Citation) => {
        if (citation.siteName) {
          return citation.siteName;
        }
        try {
          return new URL(citation.url).hostname.replace("www.", "");
        } catch {
          return "website";
        }
      };

      // Check if this is a grouped citation
      const isGroup = href.includes("#cite-group-");
      let groupCitations: Citation[] = [];

      if (isGroup) {
        // Extract citation numbers from group ID
        const groupId = href.replace("#cite-group-", "");
        const citationNumbers = groupId.split("-").map(n => parseInt(n, 10));
        groupCitations = citationNumbers
          .map(n => (n > 0 && n <= citations.length ? citations[n - 1] : null))
          .filter((c): c is NonNullable<typeof c> => c != null);
      } else {
        // Single citation
        const citationNumber = parseInt(href.split("-").pop() || "0");
        const citation =
          citationNumber > 0 && citationNumber <= citations.length
            ? citations[citationNumber - 1]
            : null;
        if (citation) {
          groupCitations = [citation];
        }
      }

      if (groupCitations.length === 0) {
        return (
          <a {...props} href={href} className="citation-link">
            {children}
          </a>
        );
      }

      // For the pill, always show the first citation's info
      const pillCitation = groupCitations[0];
      if (!pillCitation) {
        return (
          <a {...props} href={href} className="citation-link">
            {children}
          </a>
        );
      }
      const sourceName = getDisplayName(pillCitation);

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <CitationPill
              favicon={pillCitation.favicon}
              sourceName={sourceName}
              groupCount={groupCitations.length}
              href={href}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onOpenChange={setOpen}
            />
          </PopoverTrigger>
          <CitationPopoverContent
            citations={groupCitations}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onOpenChange={setOpen}
          />
        </Popover>
      );
    }

    return (
      <a {...props} href={href}>
        {children}
      </a>
    );
  });

CitationLink.displayName = "CitationLink";
