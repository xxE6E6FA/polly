import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/**
 * CitationGroup
 *
 * Wraps a contiguous set of citation links (e.g. “[1][2][3]”) and provides:
 * - Unified hover expansion with delay + cancellation
 * - ARIA semantics describing grouped citations
 * - Data attributes for styling & animation hooks
 *
 * NOTE: Public signature remains only `children`.
 */
export interface CitationGroupProps {
  children: React.ReactNode;
  closeDelay?: number;
  openDelay?: number;
  disableHover?: boolean;
  className?: string;
  onExpandedChange?: (expanded: boolean) => void;
}

type ExpandState = "collapsed" | "expanding" | "expanded" | "collapsing";

export const CitationGroup = React.memo(
  forwardRef<HTMLFieldSetElement, CitationGroupProps>(function CitationGroup(
    {
      children,
      closeDelay = 150,
      openDelay = 60,
      disableHover = false,
      className,
      onExpandedChange,
    },
    ref
  ) {
    const [expanded, setExpanded] = useState(false);
    const [phase, setPhase] = useState<ExpandState>("collapsed");

    const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isPointerInside = useRef(false);
    const groupId = useId();

    // Derive citation count by detecting anchor-like children with href "#cite-*"
    const citationElements = React.Children.toArray(
      children
    ) as React.ReactElement<{ href?: string }>[];
    const citationCount = citationElements.filter(
      el =>
        typeof el.props.href === "string" && el.props.href.startsWith("#cite-")
    ).length;

    const updateExpanded = useCallback(
      (next: boolean) => {
        setExpanded(prev => {
          if (prev !== next) {
            onExpandedChange?.(next);
          }
          return next;
        });
        setPhase(next ? "expanding" : "collapsing");
        queueMicrotask(() => {
          setPhase(next ? "expanded" : "collapsed");
        });
      },
      [onExpandedChange]
    );

    useEffect(() => {
      return () => {
        if (openTimeoutRef.current) {
          clearTimeout(openTimeoutRef.current);
        }
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
      };
    }, []);

    const clearTimers = () => {
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };

    const scheduleOpen = () => {
      clearTimers();
      openTimeoutRef.current = setTimeout(() => {
        updateExpanded(true);
      }, openDelay);
    };

    const scheduleClose = () => {
      clearTimers();
      closeTimeoutRef.current = setTimeout(() => {
        if (!isPointerInside.current) {
          updateExpanded(false);
        }
      }, closeDelay);
    };

    const handlePointerEnter = () => {
      isPointerInside.current = true;
      if (disableHover) {
        return;
      }
      scheduleOpen();
    };

    const handlePointerLeave = () => {
      isPointerInside.current = false;
      if (disableHover) {
        return;
      }
      scheduleClose();
    };

    const handleFocus = () => {
      if (disableHover) {
        return;
      }
      clearTimers();
      updateExpanded(true);
    };

    const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        scheduleClose();
      }
    };

    // Data attributes for styling hooks
    const dataState = phase;
    const baseClass =
      "citation-group inline-flex items-center gap-0.5 align-baseline";

    return (
      <fieldset
        ref={ref}
        id={groupId}
        aria-label={
          citationCount > 0
            ? `Citation group containing ${citationCount} source${citationCount === 1 ? "" : "s"}`
            : "Citation group"
        }
        className={[
          baseClass,
          className,
          expanded ? "is-expanded" : "is-collapsed",
        ]
          .filter(Boolean)
          .join(" ")}
        data-state={dataState}
        data-expanded={expanded ? "true" : "false"}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </fieldset>
    );
  })
);

CitationGroup.displayName = "CitationGroup";

/*
Styling / Animation Suggestions (Tailwind):

.citation-group[data-state="expanding"] .citation-link,
.citation-group[data-state="expanded"] .citation-link {
  @apply transition-opacity duration-150 opacity-100;
}

.citation-group[data-state="collapsing"] .citation-link,
.citation-group[data-state="collapsed"] .citation-link {
  @apply transition-opacity duration-150 opacity-70;
}
*/
