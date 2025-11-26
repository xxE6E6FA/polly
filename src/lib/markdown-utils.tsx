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
export function normalizeCitationPatterns(text: string): string {
  if (!text) {
    return text;
  }

  return (
    text
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
      .replace(/\[\s*(\d+)\s*\]/g, "[$1]")
  );
}

// Convert plain [n] citations into markdown links with grouping support
export function convertCitationsToMarkdownLinks(text: string): string {
  if (!text) {
    return text;
  }

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
  const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
    const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
    if (numbers.length === 1) {
      return `[${numbers[0]}](#cite-${numbers[0]})`;
    }
    return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
  });

  return normalized;
}

// Helper function to check if content is multi-word
export function isMultiWord(content: string): boolean {
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

  // Math rendering disabled: only apply citation transforms
  return renderCitationsForPlainText(sanitized);
}
