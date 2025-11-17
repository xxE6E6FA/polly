import type { LLMOutputComponent } from "@llm-ui/react";
import Markdown, { RuleType } from "markdown-to-jsx";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { generateHeadingId } from "@/lib/utils";
import { useCitations } from "./citation-context";
import { renderTextWithMathAndCitations } from "./markdown-utils.tsx";
import { useMessageId } from "./streaming-markdown";

// Common numeric HTML entities that might appear during streaming (kept for parity only)

// Regex patterns as constants to avoid recreation
const INCOMPLETE_ENTITY_PATTERN = /&(?:#?x?[\dA-Fa-f]{0,6}|[A-Za-z]{0,10})?$/;

// Whitespace characters pattern (excluding zero width joiner which can't be in character classes)
const WHITESPACE_CHARS =
  "(?:\\t| |\\u00A0|\\u1680|\\u180E|\\u2000|\\u2001|\\u2002|\\u2003|\\u2004|\\u2005|\\u2006|\\u2007|\\u2008|\\u2009|\\u200A|\\u202F|\\u205F|\\u3000|\\u200B|\\u200C|\\uFEFF|\\u200D)";

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

// Some providers escape Markdown control chars or send literal "\n" sequences.
// Normalize the most common cases conservatively so Markdown parses correctly.
function normalizeEscapedMarkdown(text: string): string {
  if (!text) {
    return text;
  }

  let out = text;

  // 1) Convert literal backslash-n ("\\n") to real newlines when the text
  // appears to be line-oriented (lots of "\\n" and very few real newlines).
  const hasRealNewlines = out.includes("\n");
  const literalNewlineMatches = out.match(/\\n/g);
  if (
    !hasRealNewlines &&
    literalNewlineMatches &&
    literalNewlineMatches.length >= 2
  ) {
    out = out.replace(/\\r?\\n/g, "\n");
  }

  // 2) Unescape leading block markers that were backslash-escaped, but only at
  // true line starts so we don’t disturb inline content.
  //   - Code fences:  \```lang  -> ```lang
  //   - Closing fences:  \```   -> ```
  //   - Headings: \### Title   -> ### Title
  //   - Lists: \- item, \* item, \1. item -> unescaped
  out = out
    // Opening and closing fences at (optionally indented) line start
    .replace(/(^|\n)[ \t]{0,3}\\```/g, "$1```")
    // Headings at line start
    .replace(/(^|\n)[ \t]{0,3}\\(#{1,6})(?=\s)/g, "$1$2")
    // Unordered lists at line start
    .replace(/(^|\n)[ \t]{0,3}\\([-*])(?=\s)/g, "$1$2")
    // Ordered lists at line start (e.g., \1.)
    .replace(/(^|\n)[ \t]{0,3}\\(\d+)\.(?=\s)/g, "$1$2.")
    // Blockquotes and table rows at line start
    .replace(/(^|\n)[ \t]{0,3}\\>(?=\s)/g, "$1>")
    .replace(/(^|\n)[ \t]{0,3}\\\|/g, "$1|");

  // 3) Remove stray backslash+space sequences immediately after inline emphasis
  //    e.g., "*word*\\ equivalent" or "_word_\\\u00A0equivalent" -> "*word* equivalent"
  out = out.replace(/(\*[^*\n]+\*|_[^_\n]+_)\\+[^\S\r\n]+/g, "$1 ");

  // 4) Collapse multiple backslashes before horizontal/invisible spaces (outside code)
  //    e.g., "\\\u00A0" or "\\ \t" -> single regular space
  out = out.replace(new RegExp(`\\\\+${WHITESPACE_CHARS}+`, "g"), " ");

  return out;
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

  // Move citations to end of paragraphs
  // Split by double newlines to identify paragraphs
  normalized = normalized
    .split(/\n\n+/)
    .map(paragraph => {
      // Extract all citations from the paragraph
      const citations: string[] = [];
      let cleaned = paragraph.replace(/\[(\d+)\]/g, match => {
        citations.push(match);
        return ""; // Remove from original position
      });

      // Clean up extra spaces left by removed citations
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

      // Append citations at the end of the paragraph
      if (citations.length > 0) {
        return `${cleaned} ${citations.join("")}`;
      }
      return cleaned;
    })
    .join("\n\n");

  // Group adjacent citations and replace with special format
  // [1][2][3] becomes [1,2,3](#cite-group-1-2-3)
  normalized = normalized.replace(/(?:\[(\d+)\])+/g, match => {
    // Extract all citation numbers from the match
    const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);

    if (numbers.length === 1) {
      // Single citation
      return `[${numbers[0]}](#cite-${numbers[0]})`;
    }
    // Multiple citations - create a group
    const groupId = numbers.join("-");
    return `[${numbers.join(",")}](#cite-group-${groupId})`;
  });

  return normalized;
}

// Render LaTeX ($...$ and $$...$$) to KaTeX HTML before markdown parsing

// Helper function to check if content is multi-word
function isMultiWord(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.includes(" ") || trimmed.includes("\n") || trimmed.includes("\t")
  );
}

// Convert plain text citations into JSX during render (markdown-to-jsx renderRule)

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
    const { citations } = useCitations();
    const [open, setOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Reset currentIndex when popover opens
    useEffect(() => {
      if (open) {
        setCurrentIndex(0);
      }
    }, [open]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
      };
    }, []);

    const handleMouseEnter = useCallback(() => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setOpen(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      closeTimeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 300); // 300ms delay before closing
    }, []);

    if (href?.startsWith("#cite-")) {
      // Get domain for display
      const getDomain = (url: string) => {
        try {
          return new URL(url).hostname.replace("www.", "");
        } catch {
          return "website";
        }
      };

      // Check if this is a grouped citation
      const isGroup = href.includes("#cite-group-");
      let groupCitations: typeof citations = [];

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

      const currentCitation = groupCitations[currentIndex] ?? groupCitations[0];
      if (!currentCitation) {
        return (
          <a {...props} href={href} className="citation-link">
            {children}
          </a>
        );
      }

      const sourceName = getDomain(currentCitation.url);

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="citation-pill inline-flex items-center gap-0.5 px-1 h-[14px] text-[10px] font-medium rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer border border-border align-baseline"
              style={{ lineHeight: "14px", verticalAlign: "baseline" }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onFocus={() => setOpen(true)}
              onBlur={e => {
                // Don't close if focusing within the popover
                if (
                  !(
                    e.relatedTarget && e.currentTarget.contains(e.relatedTarget)
                  )
                ) {
                  handleMouseLeave();
                }
              }}
              onClick={e => {
                e.preventDefault();
                // Scroll to citation in the gallery
                const element = document.getElementById(href.slice(1));
                element?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }}
            >
              {currentCitation.favicon && (
                <img
                  src={currentCitation.favicon}
                  alt=""
                  className="h-2 w-2 flex-shrink-0"
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span style={{ lineHeight: "14px" }}>
                {sourceName}
                {groupCitations.length > 1 && ` +${groupCitations.length - 1}`}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 p-0"
            side="top"
            align="start"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onOpenAutoFocus={e => {
              // Prevent auto-focus from interfering
              e.preventDefault();
            }}
          >
            {groupCitations.length > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setCurrentIndex(Math.max(0, currentIndex - 1));
                  }}
                  disabled={currentIndex === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous citation"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} of {groupCitations.length}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setCurrentIndex(
                      Math.min(groupCitations.length - 1, currentIndex + 1)
                    );
                  }}
                  disabled={currentIndex === groupCitations.length - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next citation"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            )}
            <a
              href={currentCitation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 hover:bg-muted/50 transition-colors rounded-b-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <div className="flex items-start gap-2">
                {currentCitation.favicon && (
                  <img
                    src={currentCitation.favicon}
                    alt=""
                    className="h-4 w-4 mt-0.5 flex-shrink-0"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    {getDomain(currentCitation.url)}
                  </div>
                  <div className="font-medium text-sm line-clamp-2 text-foreground">
                    {currentCitation.title}
                  </div>
                </div>
              </div>
            </a>
          </PopoverContent>
        </Popover>
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

// Convert explicit Markdown hard breaks to <br /> without mangling other whitespace
function applyHardLineBreaksToString(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 0) Clean stray backslash+horizontal-space (no newline) → single space
  // This addresses artifacts like \\␠ after punctuation produced by some models.
  const cleaned = text.replace(
    new RegExp(`\\\\+${WHITESPACE_CHARS}+`, "g"),
    " "
  );

  // 1) Honor hard-break markers:
  // - two or more spaces before a newline
  // - a single backslash immediately before a newline
  const re = /(?: {2,}|\\)\r?\n/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = re.exec(cleaned);
    if (match === null) {
      break;
    }
    const chunk = cleaned.slice(lastIndex, match.index);
    if (chunk) {
      nodes.push(chunk);
    }
    nodes.push(<br key={`br-${lastIndex}`} />);
    lastIndex = re.lastIndex;
  }
  const tail = cleaned.slice(lastIndex);
  if (tail) {
    nodes.push(tail);
  }
  return nodes.length > 0 ? nodes : [cleaned];
}

function applyHardLineBreaks(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return applyHardLineBreaksToString(node);
  }
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => {
      const processed = applyHardLineBreaks(child);
      if (Array.isArray(processed)) {
        return processed.map((n, i) =>
          React.isValidElement(n)
            ? React.cloneElement(n, { key: n.key ?? `n-${index}-${i}` })
            : n
        );
      }
      return processed;
    });
  }
  return node;
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
    const unescaped = normalizeEscapedMarkdown(decoded);
    const withCitationLinks = convertCitationsToMarkdownLinks(unescaped);
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

  return (
    <div className="prose prose-sm sm:prose-base max-w-none prose-headings:font-semibold prose-p:leading-[1.75] prose-li:my-1.5 prose-ul:my-3 prose-ol:my-3 prose-hr:my-6 prose-a:underline-offset-2 hover:prose-a:underline prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-pre:bg-surface-variant prose-pre:text-foreground prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:shadow-sm prose-pre:p-0 prose-pre:mt-2 prose-pre:mb-2 prose-pre:w-[calc(100%+24px)] prose-pre:max-w-none sm:prose-pre:w-[calc(100%+48px)] prose-pre:-mx-[12px] sm:prose-pre:-mx-[24px] prose-pre:overflow-x-auto prose-blockquote:border-l-border prose-blockquote:text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p:first-of-type]:mt-0 tracking-tight">
      <Markdown
        options={{
          disableParsingRawHTML: true,
          overrides,
          renderRule(next, node) {
            if (node.type === RuleType.text && typeof node.text === "string") {
              // Drop stray text nodes that are only backslashes + horizontal/invisible spaces
              if (new RegExp(`^\\\\+${WHITESPACE_CHARS}*$`).test(node.text)) {
                return " ";
              }
              const transformed = renderTextWithMathAndCitations(node.text);
              return applyHardLineBreaks(transformed);
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
