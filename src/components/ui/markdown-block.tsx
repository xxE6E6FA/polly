import React, { useMemo, useState, useRef, useEffect } from "react";

import { type LLMOutputComponent } from "@llm-ui/react";
import Markdown from "markdown-to-jsx";
import katex from "katex";
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

// Function to buffer incomplete HTML entities to prevent flashing during streaming
function bufferIncompleteEntities(text: string): string {
  // Check if text ends with a potentially incomplete HTML entity
  // Pattern: & followed by alphanumeric/# characters (but not ending with ;)
  // This catches patterns like: &, &#, &#x, &#x2, &#x20, &amp, etc.
  const incompletePattern = /&(?:#?x?[\dA-Fa-f]{0,6}|[A-Za-z]{0,10})?$/;
  const match = text.match(incompletePattern);

  if (match && match[0].length > 1 && !match[0].endsWith(";")) {
    // Remove the incomplete entity from the end
    return text.slice(0, -match[0].length);
  }

  return text;
}

// Function to clean up unwanted escape characters
function cleanupEscapes(text: string): string {
  if (!text) return text;

  // Remove backslashes before citation brackets
  let cleaned = text.replace(/\\(\[|\])/g, "$1");

  // Convert double brackets to single: [[1]] -> [1]
  cleaned = cleaned.replace(/\[\[(\d+)\]\]/g, "[$1]");

  // First, expand multi-number citations: [1, 2, 3] -> [1][2][3]
  // This handles cases with spaces inside brackets too
  cleaned = cleaned.replace(
    /\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g,
    (_match, numbers) => {
      // Split the numbers and create individual citations
      const nums = numbers.split(",").map((n: string) => n.trim());
      return nums.map((num: string) => `[${num}]`).join("");
    }
  );

  // Then remove spaces within single citations: [ 1 ] -> [1]
  cleaned = cleaned.replace(/\[\s*(\d+)\s*\]/g, "[$1]");

  return cleaned;
}

// Component for rendering LaTeX math
const MathComponent: React.FC<{ children: string; display?: boolean }> = ({
  children,
  display = false,
}) => {
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
};

// Preprocess markdown to handle LaTeX math expressions
function preprocessLaTeX(markdown: string): string {
  // First protect code blocks from LaTeX processing
  const codeBlockPattern = /```[\s\S]*?```|`[^`]*`/g;
  const codeBlocks: string[] = [];
  let codeBlockIndex = 0;

  // Replace code blocks with placeholders
  const markdownWithoutCode = markdown.replace(codeBlockPattern, match => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlockIndex++}__`;
  });

  // Replace LaTeX patterns with special markers that we can handle in overrides
  let processed = markdownWithoutCode;

  // Display math: \[...\] or $$...$$
  processed = processed.replace(
    /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g,
    (_, m1, m2) => `<DisplayMath>${m1 || m2}</DisplayMath>`
  );

  // Inline math: \(...\) or $...$
  processed = processed.replace(
    /\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g,
    (_, m1, m2) => `<InlineMath>${m1 || m2}</InlineMath>`
  );

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return processed;
}

// Preprocess citations to styled links
function preprocessCitations(text: string): string {
  if (!text) return text;

  // First, clean up any escaped citations
  let processed = cleanupEscapes(text);

  // Pattern to match citation groups, including:
  // - Direct adjacency: [1][2][3]
  // - Comma separated: [1], [2], [3]
  // - Comma separated without spaces: [1],[2],[3]
  // - Mixed spacing: [1] , [2], [3]
  const citationGroupPattern = /(\[\d+\](?:\s*,?\s*\[\d+\])+)/g;

  // Replace groups of citations with a span wrapper
  processed = processed.replace(citationGroupPattern, match => {
    // Extract all citation numbers from the group
    const citations = match.match(/\[\d+\]/g);
    if (!citations || citations.length <= 1) return match;

    // Build the wrapped group
    const wrappedCitations = citations
      .map(citation => {
        const num = citation.match(/\d+/)?.[0];
        return `<sup class="citation-wrapper"><a href="#cite-${num}" class="citation-link">${num}</a></sup>`;
      })
      .join("");

    return `<span class="citation-group">${wrappedCitations}</span>`;
  });

  // Handle single citations that aren't part of a group
  const singleCitationPattern =
    /(?<!<span class="citation-group">.*)\[(\d+)\](?!.*<\/span>)/g;

  processed = processed.replace(singleCitationPattern, (match, num) => {
    // Check if this citation is inside a code block
    const beforeMatch = processed.substring(0, processed.indexOf(match));
    const codeBlockCount = (beforeMatch.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      return match; // Inside a code block, don't process
    }

    return `<span class="citation-group"><sup class="citation-wrapper"><a href="#cite-${num}" class="citation-link">${num}</a></sup></span>`;
  });

  return processed;
}

// Create heading override function
const createHeadingOverride = (
  level: 1 | 2 | 3 | 4 | 5 | 6,
  messageId?: string
) => ({
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

// Citation Group component with stable hover state
const CitationGroup: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const groupRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 150); // Shorter delay for more responsive feel
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span
      ref={groupRef}
      className={`citation-group ${isExpanded ? "expanded" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </span>
  );
};

// Markdown component for llm-ui
export const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;
  const messageId = useMessageId();

  // Buffer incomplete HTML entities, process LaTeX, and process citations
  const processedMarkdown = useMemo(() => {
    const buffered = bufferIncompleteEntities(markdown);
    const latexProcessed = preprocessLaTeX(buffered);
    return preprocessCitations(latexProcessed);
  }, [markdown]);

  return (
    <div className="prose prose-base max-w-none dark:prose-invert prose-p:leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
            // Handle citation links
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => {
                // Check if this is a citation link
                if (href && href.startsWith("#cite-")) {
                  const citationNumber = String(children);

                  return (
                    <sup
                      className={`citation-wrapper inline-flex items-center relative transition-all duration-200 hover:z-30`}
                    >
                      <a {...props} href={href} className="citation-link">
                        {citationNumber}
                      </a>
                    </sup>
                  );
                }
                // Regular links
                return (
                  <a {...props} href={href}>
                    {children}
                  </a>
                );
              },
            },
            // Handle citation groups
            span: {
              component: ({
                className,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"span">) => {
                if (className && className.includes("citation-group")) {
                  return <CitationGroup>{children}</CitationGroup>;
                }
                return (
                  <span className={className} {...props}>
                    {children}
                  </span>
                );
              },
            },
            // Add heading overrides to include IDs
            h1: createHeadingOverride(1, messageId),
            h2: createHeadingOverride(2, messageId),
            h3: createHeadingOverride(3, messageId),
            h4: createHeadingOverride(4, messageId),
            h5: createHeadingOverride(5, messageId),
            h6: createHeadingOverride(6, messageId),
          },
        }}
      >
        {processedMarkdown}
      </Markdown>
    </div>
  );
};
