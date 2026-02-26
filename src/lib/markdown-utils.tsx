import TeX from "@matejmazur/react-katex";
import React, { type ReactNode } from "react";
import { CitationGroup } from "@/components/ui/citation-group";

// Regex patterns as constants to avoid recreation
const INCOMPLETE_ENTITY_PATTERN = /&(?:#?x?[\dA-Fa-f]{0,6}|[A-Za-z]{0,10})?$/;

// Whitespace characters pattern (excluding zero width joiner which can't be in character classes)
const WHITESPACE_CHARS =
  "(?:\\t| |\\u00A0|\\u1680|\\u180E|\\u2000|\\u2001|\\u2002|\\u2003|\\u2004|\\u2005|\\u2006|\\u2007|\\u2008|\\u2009|\\u200A|\\u202F|\\u205F|\\u3000|\\u200B|\\u200C|\\uFEFF|\\u200D)";

// Function to buffer incomplete HTML entities to prevent flashing during streaming
export function bufferIncompleteEntities(text: string): string {
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
export function normalizeLatexDelimiters(text: string): string {
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
export function decodeMinimalEntities(text: string): string {
  if (!text) {
    return text;
  }
  // Replace numeric space and newline entities
  return text.replace(/&#x20;|&#32;/g, " ").replace(/&#x0A;|&#10;/g, "\n");
}

// Some providers escape Markdown control chars or send literal "\n" sequences.
// Normalize the most common cases conservatively so Markdown parses correctly.
export function normalizeEscapedMarkdown(text: string): string {
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
  // true line starts so we don't disturb inline content.
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

  // 3) Unescape brackets for citations: \[1\] -> [1]
  //    This ensures citation conversion works even if providers escape brackets
  out = out.replace(/\\(\[|\])/g, "$1");

  // 4) Remove stray backslash+space sequences immediately after inline emphasis
  //    e.g., "*word*\\ equivalent" or "_word_\\\u00A0equivalent" -> "*word* equivalent"
  out = out.replace(/(\*[^*\n]+\*|_[^_\n]+_)\\+[^\S\r\n]+/g, "$1 ");

  // 5) Collapse multiple backslashes before horizontal/invisible spaces (outside code)
  //    e.g., "\\\u00A0" or "\\ \t" -> single regular space
  out = out.replace(new RegExp(`\\\\+${WHITESPACE_CHARS}+`, "g"), " ");

  return out;
}

// Normalize citation patterns to clean [N] format
function normalizeCitationPatterns(text: string): string {
  if (!text) {
    return text;
  }

  let result = text
    // Remove backslashes before brackets: \[1] -> [1]
    .replace(/\\(\[|\])/g, "$1")
    // Convert double brackets to single: [[1]] -> [1]
    .replace(/\[\[(\d+)\]\]/g, "[$1]")
    // Normalize grouped citations: [1, 2,3] -> [1][2][3]
    // But NOT if followed by ( which indicates an existing markdown link
    .replace(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\](?!\()/g, (_m, nums: string) =>
      nums
        .split(",")
        .map(n => `[${n.trim()}]`)
        .join("")
    )
    // Normalize single citation spacing: [ 1 ] -> [1]
    // But NOT if followed by ( which indicates an existing markdown link
    .replace(/\[\s*(\d+)\s*\](?!\()/g, "[$1]");

  // Remove spaces between adjacent citations: [1] [2] -> [1][2]
  // Uses lookahead to not consume the next citation, allowing chains like [1] [2] [3]
  result = result.replace(/(\[\d+\])\s+(?=\[\d+\])/g, "$1");

  return result;
}

// Convert plain [n] citations into markdown links with grouping support
export function convertCitationsToMarkdownLinks(text: string): string {
  if (!text) {
    return text;
  }

  // First normalize citation patterns (escape sequences, spacing, etc.)
  const cleaned = normalizeCitationPatterns(text);

  // Convert inline citation numbers to anchor links for the CitationLink component
  // Examples:
  //   [1] -> [1](#cite-1)
  //   [1][2][3] -> [1,2,3](#cite-group-1-2-3)
  //
  // The regex /((?:\[\d+\])+)(?!\(#cite-)/g matches:
  // - One or more consecutive [N] patterns
  // - NOT followed by (#cite- (negative lookahead to avoid double-conversion)
  //
  // This makes the function idempotent - running it multiple times produces the same result.
  // Note: Assumes AI outputs clean citations like [1][2], not malformed ones like [1][2](#cite-group-1-2)
  const normalized = cleaned.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
    const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
    if (numbers.length === 1) {
      return `[${numbers[0]}](#cite-${numbers[0]})`;
    }
    return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
  });

  return normalized;
}

// Helper function to check if content is multi-word
function isMultiWord(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.includes(" ") || trimmed.includes("\n") || trimmed.includes("\t")
  );
}

// Function to remove parentheses around italic text
export function removeParenthesesAroundItalics(text: string): string {
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
export function applyHardLineBreaksToString(text: string): React.ReactNode[] {
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

export function applyHardLineBreaks(node: React.ReactNode): React.ReactNode {
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

// Match display math ($$...$$, multiline) and inline math ($...$, single-line).
// Opening $ must be preceded by start-of-string or non-alphanumeric.
// Closing $ must NOT be followed by a digit — this prevents false matches in text
// like "$10 and $20" while allowing "$2$", "$2p$", etc.
const MATH_PATTERN =
  /\$\$([^$]+?)\$\$|(?:^|(?<=\s|[^\\$\w]))\$([^$\n]+?)\$(?!\d)/g;

// Wrap math expressions in inline code spans to protect them from markdown parsing.
// Content inside backticks is preserved verbatim by markdown-to-jsx, so underscores,
// braces, asterisks etc. in LaTeX like $d_{ij}$ won't be mangled.
// The MathCode component override detects these and renders KaTeX.
export function wrapMathInCodeSpans(text: string): string {
  if (!text) {
    return text;
  }
  // Split on existing inline code spans to avoid double-wrapping
  const CODE_SPAN = /(`[^`\n]+`)/g;
  const parts = text.split(CODE_SPAN);
  return parts
    .map((part, i) => {
      // Odd indices are existing code spans — leave them alone
      if (i % 2 === 1) {
        return part;
      }
      // Even indices are regular text — wrap math in backticks
      MATH_PATTERN.lastIndex = 0;
      return part.replace(MATH_PATTERN, match => {
        // Collapse newlines to spaces (KaTeX doesn't need them)
        const collapsed = match.replace(/\n/g, " ");
        return `\`${collapsed}\``;
      });
    })
    .join("");
}

// AI models often escape markdown-sensitive characters inside math expressions
// (e.g. $d\_{ij}$ instead of $d_{ij}$) to prevent markdown parsers from
// mangling them. Un-escape these so KaTeX gets clean LaTeX.
// Only un-escapes chars that are markdown formatting but NOT meaningful LaTeX
// math-mode commands: \_ → _ (subscript), \* → * (multiplication).
// Does NOT un-escape \{ \} \[ \] which have legitimate LaTeX meaning.
function unescapeMarkdownInLatex(latex: string): string {
  return latex.replace(/\\_/g, "_").replace(/\\\*/g, "*");
}

// Try to render a string as KaTeX math if it has $ delimiters.
// Returns null if the text doesn't look like math.
// Used by both MathCode component and renderRule for codeInline nodes.
export function tryRenderMath(text: string): ReactNode | null {
  // Display math: $$...$$
  if (text.startsWith("$$") && text.endsWith("$$") && text.length > 4) {
    const latex = unescapeMarkdownInLatex(text.slice(2, -2).trim());
    return renderMathSegment(latex, true, "dmath");
  }
  // Inline math: $...$
  if (
    text.startsWith("$") &&
    text.endsWith("$") &&
    text.length > 2 &&
    !text.startsWith("$$")
  ) {
    const latex = unescapeMarkdownInLatex(text.slice(1, -1));
    return renderMathSegment(latex, false, "imath");
  }
  return null;
}

// Component for inline code that detects math delimiters and renders KaTeX.
// Used as a `code` override in markdown-to-jsx to intercept backtick-wrapped math.
export const MathCode: React.FC<React.ComponentPropsWithoutRef<"code">> =
  React.memo(function MathCode({ children, className, ...props }) {
    // Extract text from children — handle string or single-element array
    let text: string | null = null;
    if (typeof children === "string") {
      text = children;
    } else if (
      Array.isArray(children) &&
      children.length === 1 &&
      typeof children[0] === "string"
    ) {
      text = children[0];
    }

    if (text) {
      const mathNode = tryRenderMath(text);
      if (mathNode) {
        return mathNode;
      }
    }
    // Regular code — pass through with original styling
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  });

function renderMathSegment(
  latex: string,
  display: boolean,
  key: string
): ReactNode {
  return (
    <TeX
      key={key}
      math={latex}
      block={display}
      className={display ? "katex-display" : "katex-inline"}
      renderError={error => (
        <span className="katex-error" title={String(error)}>
          {latex}
        </span>
      )}
    />
  );
}

function stripDanglingClosers(text: string): string {
  return text.replace(/<\/(?:span|a|div|p|em|strong|code|pre)>/gi, "");
}

function renderCitationsForPlainText(text: string): ReactNode {
  // Normalize common escaped or malformed citation patterns first
  const normalized = normalizeCitationPatterns(text);

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

  // Split on math patterns, render math with KaTeX, pass rest through citations
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let mathIdx = 0;

  MATH_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = MATH_PATTERN.exec(sanitized);

  while (match) {
    const before = sanitized.slice(lastIndex, match.index);
    if (before) {
      parts.push(renderCitationsForPlainText(before));
    }

    const displayLatex = match[1]; // $$...$$ capture
    const inlineLatex = match[2]; // $...$ capture
    const isDisplay = displayLatex != null;
    const latex = (isDisplay ? displayLatex : inlineLatex) ?? "";

    parts.push(renderMathSegment(latex, isDisplay, `math-${mathIdx++}`));

    lastIndex = match.index + match[0].length;
    match = MATH_PATTERN.exec(sanitized);
  }

  const tail = sanitized.slice(lastIndex);
  if (tail) {
    parts.push(renderCitationsForPlainText(tail));
  }

  if (parts.length === 0) {
    return renderCitationsForPlainText(sanitized);
  }
  return parts.length === 1 ? parts[0] : parts;
}
