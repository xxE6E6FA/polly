import type { LLMOutputComponent } from "@llm-ui/react";
import katex from "katex";
import Markdown from "markdown-to-jsx";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "katex/dist/katex.min.css";

import { generateHeadingId } from "@/lib/utils";

import { useMessageId } from "./streaming-markdown";

// Common numeric HTML entities that might appear during streaming
const NUMERIC_ENTITIES = {
  "#32": " ", // Space
  "#x20": " ", // Space (hex)
  "#39": "'", // Apostrophe
  "#x27": "'", // Apostrophe (hex)
  "#160": " ", // Non-breaking space
  "#xa0": " ", // Non-breaking space (hex)
};

// Regex patterns as constants to avoid recreation
const INCOMPLETE_ENTITY_PATTERN = /&(?:#?x?[\dA-Fa-f]{0,6}|[A-Za-z]{0,10})?$/;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]*`/g;
const CITATION_GROUP_PATTERN = /\s*(\[\d+\](?:\s*,?\s*\[\d+\])+)\s*/g;
const SINGLE_CITATION_PATTERN = /\s*\[(\d+)\]\s*/g;
const CURRENCY_WITH_UNITS_PATTERN =
  /\$[\d,]+(\.\d+)?\s*(billion|million|trillion|thousand|k|m|b|t|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|dollars?|cents?|pounds?|euros?|yen|yuan|rupees?|pesos?|reals?|rubles?|won|francs?|krona|krone|zloty|forint|shekel|rand|lira|baht|ringgit|rupiah|dong)(?=\s|$|[^\w])/gi;
const STANDALONE_CURRENCY_PATTERN = /\$[\d,]+(\.\d{1,2})?(?=\s|$|[^\w])/g;
const DISPLAY_MATH_PATTERN = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
const INLINE_MATH_PATTERN = /\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g;
const CURRENCY_DETECTION_PATTERN =
  /^\s*[\d,]+(\.\d+)?\s*(billion|million|trillion|thousand|k|m|b|t|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|dollars?|cents?|pounds?|euros?|yen|yuan|rupees?|pesos?|reals?|rubles?|won|francs?|krona|krone|zloty|forint|shekel|rand|lira|baht|ringgit|rupiah|dong)\s*$/i;
const STANDALONE_CURRENCY_DETECTION_PATTERN = /^\s*[\d,]+(\.\d{1,2})?\s*$/;

// Function to buffer incomplete HTML entities to prevent flashing during streaming
function bufferIncompleteEntities(text: string): string {
  const match = text.match(INCOMPLETE_ENTITY_PATTERN);

  if (match && match[0].length > 1 && !match[0].endsWith(";")) {
    return text.slice(0, -match[0].length);
  }

  return text;
}

// Function to clean up unwanted escape characters
function cleanupEscapes(text: string): string {
  if (!text) {
    return text;
  }

  return text
    .replace(/\\(\[|\])/g, "$1") // Remove backslashes before citation brackets
    .replace(/\[\[(\d+)\]\]/g, "[$1]") // Convert double brackets to single: [[1]] -> [1]
    .replace(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g, (_, numbers) => {
      // First, expand multi-number citations: [1, 2, 3] -> [1][2][3]
      const nums = numbers.split(",").map((n: string) => n.trim());
      return nums.map((num: string) => `[${num}]`).join("");
    })
    .replace(/\[\s*(\d+)\s*\]/g, "[$1]") // Then remove spaces within single citations: [ 1 ] -> [1]
    .replace(/\\(\s)/g, "$1") // Remove backslashes before spaces (common markdown parsing issue)
    .replace(/\\$/gm, ""); // Remove backslashes at end of lines
}

// Component for rendering LaTeX math
const MathComponent: React.FC<{ children: string; display?: boolean }> =
  React.memo(({ children, display = false }) => {
    const html = useMemo(() => {
      try {
        return katex.renderToString(children, {
          displayMode: display,
          throwOnError: false,
          errorColor: "#cc0000",
          strict: false,
        });
      } catch (e) {
        console.error("KaTeX render error:", e);
        return `<span class="katex-error">Error: ${children}</span>`;
      }
    }, [children, display]);

    return (
      <span
        dangerouslySetInnerHTML={{ __html: html }}
        className={display ? "katex-display block" : "katex-inline"}
      />
    );
  });

MathComponent.displayName = "MathComponent";

// Helper function to check if content is multi-word
function isMultiWord(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.includes(" ") || trimmed.includes("\n") || trimmed.includes("\t")
  );
}

// Preprocess markdown to handle LaTeX math expressions
function preprocessLaTeX(markdown: string): string {
  const codeBlocks: string[] = [];
  let codeBlockIndex = 0;

  // Replace code blocks with placeholders
  const markdownWithoutCode = markdown.replace(CODE_BLOCK_PATTERN, match => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlockIndex++}__`;
  });

  const currencyPatterns: string[] = [];
  let currencyIndex = 0;

  // Protect currency patterns like $350 billion, $2.5 trillion, etc.
  let processed = markdownWithoutCode.replace(
    CURRENCY_WITH_UNITS_PATTERN,
    match => {
      currencyPatterns.push(match);
      return `__CURRENCY_${currencyIndex++}__`;
    }
  );

  // Also protect standalone currency amounts like $350, $2.50, etc.
  processed = processed.replace(STANDALONE_CURRENCY_PATTERN, match => {
    currencyPatterns.push(match);
    return `__CURRENCY_${currencyIndex++}__`;
  });

  // Replace LaTeX patterns with special markers
  processed = processed.replace(
    DISPLAY_MATH_PATTERN,
    (_, m1, m2) => `<DisplayMath>${m1 || m2}</DisplayMath>`
  );

  processed = processed.replace(INLINE_MATH_PATTERN, (match, m1, m2) => {
    // If this is a \(...\) pattern, always process as LaTeX
    if (m1) {
      return `<InlineMath>${m1}</InlineMath>`;
    }

    // For $...$ patterns, check if it looks like currency
    if (m2) {
      if (
        CURRENCY_DETECTION_PATTERN.test(m2) ||
        STANDALONE_CURRENCY_DETECTION_PATTERN.test(m2)
      ) {
        return match; // This looks like currency, don't process as LaTeX
      }
    }

    // Process as LaTeX if it doesn't look like currency
    return `<InlineMath>${m2}</InlineMath>`;
  });

  // Restore currency patterns
  currencyPatterns.forEach((pattern, index) => {
    processed = processed.replace(`__CURRENCY_${index}__`, pattern);
  });

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return processed;
}

// Preprocess citations to styled links
function preprocessCitations(text: string): string {
  if (!text) {
    return text;
  }

  let processed = cleanupEscapes(text);

  // Replace groups of citations with a span wrapper
  processed = processed.replace(
    CITATION_GROUP_PATTERN,
    (match, citationGroup) => {
      // Extract all citation numbers from the group
      const citations = citationGroup.match(/\[\d+\]/g);
      if (!citations || citations.length <= 1) {
        return match;
      }

      // Build the wrapped group (no whitespace around or between citations)
      const wrappedCitations = citations
        .map((citation: string) => {
          const num = citation.match(/\d+/)?.[0];
          return `<a href="#cite-${num}" class="citation-link">${num}</a>`;
        })
        .join("");

      return `<span class="citation-group">${wrappedCitations}</span>`;
    }
  );

  // Handle single citations that aren't part of a group
  // Fix: Use a more robust approach to avoid indexOf issues
  const citationMatches: Array<{ match: string; num: string; index: number }> =
    [];

  // Reset the regex lastIndex to ensure proper iteration
  SINGLE_CITATION_PATTERN.lastIndex = 0;

  let match = SINGLE_CITATION_PATTERN.exec(processed);
  while (match !== null) {
    // Check if this citation is inside a code block
    const beforeMatch = processed.substring(0, match.index);
    const codeBlockCount = (beforeMatch.match(/```/g) || []).length;

    // Check if it's already wrapped in a citation group
    const isInGroup =
      beforeMatch.includes('<span class="citation-group">') &&
      !beforeMatch.includes("</span>");

    if (codeBlockCount % 2 === 0 && !isInGroup) {
      citationMatches.push({
        match: match[0], // Full match including whitespace
        num: match[1], // Citation number
        index: match.index,
      });
    }

    match = SINGLE_CITATION_PATTERN.exec(processed);
  }

  // Process matches in reverse order to maintain correct indices
  citationMatches.reverse().forEach(({ match, num, index }) => {
    // Replace the entire match (including whitespace) with just the citation HTML
    const replacement = `<span class="citation-group"><a href="#cite-${num}" class="citation-link">${num}</a></span>`;
    processed =
      processed.slice(0, index) +
      replacement +
      processed.slice(index + match.length);
  });

  return processed;
}

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
    // Check if this is a citation link
    if (href?.startsWith("#cite-")) {
      // Don't add additional wrapper - preprocessCitations already handles this
      return (
        <a {...props} href={href} className="citation-link">
          {children}
        </a>
      );
    }

    // Regular links
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
    // Always render italic text properly
    return <em {...props}>{children}</em>;
  });

EmphasisOverride.displayName = "EmphasisOverride";

// Function to remove parentheses around italic text
function removeParenthesesAroundItalics(text: string): string {
  if (!text) {
    return text;
  }

  // Helper function to process italic patterns
  const processItalicPattern =
    (marker: string) => (match: string, content: string) => {
      // Only remove parentheses if the italic content contains multiple words
      if (isMultiWord(content)) {
        return `${marker}${content}${marker}`;
      }
      return match; // Keep original if single word
    };

  return text
    .replace(/\(\s*\*([\s\S]*?)\*\s*\)/g, processItalicPattern("*"))
    .replace(/\(\s*_([\s\S]*?)_\s*\)/g, processItalicPattern("_"));
}

// Markdown component for llm-ui
export const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;
  const messageId = useMessageId();

  // Buffer incomplete HTML entities, remove parentheses around italics, process LaTeX, and citations
  const processedMarkdown = useMemo(() => {
    const buffered = bufferIncompleteEntities(markdown);
    const parenthesesRemoved = removeParenthesesAroundItalics(buffered);
    const latexProcessed = preprocessLaTeX(parenthesesRemoved);
    return preprocessCitations(latexProcessed);
  }, [markdown]);

  const headingOverrides = useMemo(
    () => ({
      h1: createHeadingOverride(1, messageId),
      h2: createHeadingOverride(2, messageId),
      h3: createHeadingOverride(3, messageId),
      h4: createHeadingOverride(4, messageId),
      h5: createHeadingOverride(5, messageId),
      h6: createHeadingOverride(6, messageId),
    }),
    [messageId]
  );

  return (
    <div className="prose prose-base dark:prose-invert prose-p:leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        options={{
          forceBlock: true,
          namedCodesToUnicode: NUMERIC_ENTITIES,
          overrides: {
            // Handle our custom LaTeX components
            DisplayMath: {
              component: ({ children }) => (
                <MathComponent display={true}>{String(children)}</MathComponent>
              ),
            },
            InlineMath: {
              component: ({ children }) => (
                <MathComponent display={false}>
                  {String(children)}
                </MathComponent>
              ),
            },
            // Custom italic text styling
            em: {
              component: EmphasisOverride,
            },
            // Handle citation links
            a: {
              component: CitationLink,
            },
            // Handle citation groups
            span: {
              component: SpanOverride,
            },
            // Add heading overrides to include IDs
            ...headingOverrides,
          },
        }}
      >
        {processedMarkdown}
      </Markdown>
    </div>
  );
};
