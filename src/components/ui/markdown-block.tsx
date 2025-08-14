import type { LLMOutputComponent } from "@llm-ui/react";
import Markdown, { RuleType } from "markdown-to-jsx";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { generateHeadingId } from "@/lib/utils";
import { renderTextWithMathAndCitations } from "./markdown-utils.tsx";
import { useMessageId } from "./streaming-markdown";

// Common numeric HTML entities that might appear during streaming (kept for parity only)

// Regex patterns as constants to avoid recreation
const INCOMPLETE_ENTITY_PATTERN = /&(?:#?x?[\dA-Fa-f]{0,6}|[A-Za-z]{0,10})?$/;

// Function to buffer incomplete HTML entities to prevent flashing during streaming
function bufferIncompleteEntities(text: string): string {
  if (!text || text.indexOf("&") === -1) {
    return text;
  }
  const match = text.match(INCOMPLETE_ENTITY_PATTERN);
  if (match && match[0].length > 1 && !match[0].endsWith(";")) {
    return text.slice(0, -match[0].length);
  }
  return text;
}

// Normalize LaTeX delimiters so math parsing reliably recognizes blocks and inline math
function normalizeLatexDelimiters(text: string): string {
  if (!text) {
    return text;
  }
  // Convert \\[ ... \\] to $$ ... $$ (display)
  const convertDisplay = text.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_m, inner) => `$$${inner}$$`
  );
  // Convert \\( ... \\) to $ ... $ (inline)
  const convertInline = convertDisplay.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_m, inner) => `$${inner}$`
  );
  return convertInline;
}

// Decode only minimal numeric entities we see from the streaming parser
function decodeMinimalEntities(text: string): string {
  if (!text) {
    return text;
  }
  // Replace numeric space and newline entities
  return text.replace(/&#x20;|&#32;/g, " ").replace(/&#x0A;|&#10;/g, "\n");
}

// Convert plain [n] citations into markdown links so they always render as anchors
function convertCitationsToMarkdownLinks(text: string): string {
  if (!text) {
    return text;
  }

  // Normalize escaped and grouped patterns first
  let normalized = text
    // Remove backslashes before brackets: \[1] -> [1]
    .replace(/\\(\[|\])/g, "$1")
    // Convert double brackets: [[1]] -> [1]
    .replace(/\[\[(\d+)\]\]/g, "[$1]")
    // Expand grouped citations: [1, 2,3] -> [1][2][3]
    .replace(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g, (_m, nums: string) =>
      nums
        .split(",")
        .map(n => `[${n.trim()}]`)
        .join("")
    )
    // Normalize spaces: [ 3 ] -> [3]
    .replace(/\[\s*(\d+)\s*\]/g, "[$1]");

  // Replace each [n] with [n](#cite-n)
  normalized = normalized.replace(/\[(\d+)\]/g, (_m, n: string) => {
    return `[${n}](#cite-${n})`;
  });

  return normalized;
}

// Render LaTeX ($...$ and $$...$$) to KaTeX HTML before markdown parsing
// removed renderLatexToHtml (math handled in renderRule)

// Helper function to check if content is multi-word
function isMultiWord(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.includes(" ") || trimmed.includes("\n") || trimmed.includes("\t")
  );
}

// Convert plain text citations into JSX during render (markdown-to-jsx renderRule)
// legacy placeholders removed; logic lives in markdown-utils

// Create heading override function - cached to prevent unnecessary re-renders
const headingOverrideCache = new Map<
  string,
  { component: React.ComponentType<React.ComponentPropsWithoutRef<"h1">> }
>();

const createHeadingOverride = (
  level: 1 | 2 | 3 | 4 | 5 | 6,
  messageId?: string
) => {
  const key = `${level}-${messageId || ""}`;

  if (!headingOverrideCache.has(key)) {
    headingOverrideCache.set(key, {
      component: (props: React.ComponentPropsWithoutRef<"h1">) => {
        const { children, ...rest } = props;
        const textContent = React.Children.toArray(children)
          .map(child => (typeof child === "string" ? child : ""))
          .join("");

        const id = messageId ? generateHeadingId(textContent, messageId) : "";
        const HeadingTag = `h${level}` as const;

        return (
          <HeadingTag {...rest} id={id}>
            {children}
          </HeadingTag>
        );
      },
    });
  }

  const cachedOverride = headingOverrideCache.get(key);
  if (!cachedOverride) {
    throw new Error(`Heading override not found for key: ${key}`);
  }
  return cachedOverride;
};

// Citation Group component with stable hover state
const CitationGroup: React.FC<{ children: React.ReactNode }> = React.memo(
  ({ children }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsExpanded(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
      timeoutRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 150);
    }, []);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    return (
      <span
        className={`citation-group ${isExpanded ? "expanded" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
    );
  }
);

CitationGroup.displayName = "CitationGroup";

// Citation Link component for handling citation links vs regular links
const CitationLink: React.FC<React.ComponentPropsWithoutRef<"a">> = React.memo(
  ({ href, children, ...props }) => {
    if (href?.startsWith("#cite-")) {
      return (
        <a {...props} href={href} className="citation-link">
          {children}
        </a>
      );
    }

    return (
      <a {...props} href={href}>
        {children}
      </a>
    );
  }
);

CitationLink.displayName = "CitationLink";

// Span Override component for handling citation groups
const SpanOverride: React.FC<React.ComponentPropsWithoutRef<"span">> =
  React.memo(({ className, children, ...props }) => {
    if (className?.includes("citation-group")) {
      return <CitationGroup>{children}</CitationGroup>;
    }

    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  });

SpanOverride.displayName = "SpanOverride";

// Emphasis Override component for handling italics
const EmphasisOverride: React.FC<React.ComponentPropsWithoutRef<"em">> =
  React.memo(({ children, ...props }) => {
    return <em {...props}>{children}</em>;
  });

EmphasisOverride.displayName = "EmphasisOverride";

// Function to remove parentheses around italic text
function removeParenthesesAroundItalics(text: string): string {
  if (!text) {
    return text;
  }

  const processItalicPattern =
    (marker: string) => (match: string, content: string) => {
      if (isMultiWord(content)) {
        return `${marker}${content}${marker}`;
      }
      return match;
    };

  return text
    .replace(/\(\s*\*([\s\S]*?)\*\s*\)/g, processItalicPattern("*"))
    .replace(/\(\s*_([\s\S]*?)_\s*\)/g, processItalicPattern("_"));
}

// Markdown component for llm-ui
const MarkdownBlockComponent: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;
  const messageId = useMessageId();

  const processedMarkdown = useMemo(() => {
    const buffered = bufferIncompleteEntities(markdown);
    const parenthesesRemoved = removeParenthesesAroundItalics(buffered);
    const normalizedLatex = normalizeLatexDelimiters(parenthesesRemoved);
    const decoded = decodeMinimalEntities(normalizedLatex);
    const withCitationLinks = convertCitationsToMarkdownLinks(decoded);
    return withCitationLinks;
  }, [markdown]);

  const overrides = useMemo(() => {
    return {
      h1: { component: createHeadingOverride(1, messageId).component },
      h2: { component: createHeadingOverride(2, messageId).component },
      h3: { component: createHeadingOverride(3, messageId).component },
      h4: { component: createHeadingOverride(4, messageId).component },
      h5: { component: createHeadingOverride(5, messageId).component },
      h6: { component: createHeadingOverride(6, messageId).component },
      em: { component: EmphasisOverride },
      a: { component: CitationLink },
      span: { component: SpanOverride },
    } as const;
  }, [messageId]);

  // debug logs removed

  return (
    <div className="prose prose-base dark:prose-invert prose-p:leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        options={{
          disableParsingRawHTML: true,
          overrides,
          renderRule(next, node) {
            if (node.type === RuleType.text && typeof node.text === "string") {
              return renderTextWithMathAndCitations(node.text);
            }
            return next();
          },
        }}
      >
        {processedMarkdown}
      </Markdown>
    </div>
  );
};

export const MarkdownBlock = React.memo(
  MarkdownBlockComponent,
  (prev, next) => prev.blockMatch.output === next.blockMatch.output
);
