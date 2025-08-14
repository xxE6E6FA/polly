import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

function stripDanglingClosers(text: string): string {
  return text.replace(/<\/(?:span|a|div|p|em|strong|code|pre)>/gi, "");
}

function renderCitationsForPlainText(text: string): ReactNode {
  // Normalize common escaped or malformed citation patterns first
  const normalized = text
    // Remove backslashes before brackets: \[1] -> [1]
    .replace(/\\(\[|\])/g, "$1")
    // Convert double brackets to single: [[1]] -> [1]
    .replace(/\[\[(\d+)\]\]/g, "[$1]")
    // Normalize grouped citations: [1, 2,3] -> [1][2][3]
    .replace(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g, (_m, nums: string) =>
      nums
        .split(",")
        .map(n => `[${n.trim()}]`)
        .join("")
    )
    // Normalize single citation spacing: [ 1 ] -> [1]
    .replace(/\[\s*(\d+)\s*\]/g, "[$1]");

  const parts: ReactNode[] = [];
  let start = 0;
  let group: React.ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null = re.exec(normalized);
  while (m) {
    const between = normalized.slice(start, m.index);
    if (between) {
      if (group.length > 0 && between.trim() === "") {
        // keep grouping contiguous citations
      } else {
        if (group.length > 0) {
          parts.push(
            <CitationGroup key={`grp-${start}`}>{group}</CitationGroup>
          );
          group = [];
        }
        parts.push(between);
      }
    }
    const num = m[1];
    group.push(
      <a
        key={`cite-${num}-${m.index}`}
        href={`#cite-${num}`}
        className="citation-link"
      >
        {num}
      </a>
    );
    start = re.lastIndex;
    m = re.exec(normalized);
  }
  if (group.length > 0) {
    parts.push(<CitationGroup key={`grp-${start}`}>{group}</CitationGroup>);
  }
  const tail = normalized.slice(start);
  if (tail) {
    parts.push(tail);
  }
  return parts.length === 1 ? parts[0] : parts;
}

export function renderTextWithMathAndCitations(text: string): ReactNode {
  if (!text) {
    return text;
  }

  const sanitized = stripDanglingClosers(text)
    // normalize grouped citations [1, 2] -> [1][2]
    .replace(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g, (_m, nums: string) =>
      nums
        .split(",")
        .map(n => `[${n.trim()}]`)
        .join("")
    );

  // Math rendering disabled: only apply citation transforms
  return renderCitationsForPlainText(sanitized);
}

// Lightweight copy of the interactive CitationGroup used in markdown-block.
// It preserves the hover expansion behavior for grouped citations so the UI remains consistent.
const CitationGroup: React.FC<{ children: React.ReactNode }> = memo(
  ({ children }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const onEnter = useCallback(() => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      setIsExpanded(true);
    }, []);

    const onLeave = useCallback(() => {
      timeoutRef.current = window.setTimeout(() => setIsExpanded(false), 150);
    }, []);

    useEffect(
      () => () => {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }
      },
      []
    );

    return (
      <span
        className={`citation-group ${isExpanded ? "expanded" : ""}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {children}
      </span>
    );
  }
);

CitationGroup.displayName = "CitationGroupInline";
