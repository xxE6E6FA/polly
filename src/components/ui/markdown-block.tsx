import type { LLMOutputComponent } from "@llm-ui/react";
import Markdown, { RuleType } from "markdown-to-jsx/react";
import React, { useMemo } from "react";
import {
  applyHardLineBreaks,
  bufferIncompleteEntities,
  convertCitationsToMarkdownLinks,
  decodeMinimalEntities,
  MathCode,
  normalizeEscapedMarkdown,
  normalizeLatexDelimiters,
  removeParenthesesAroundItalics,
  renderTextWithMathAndCitations,
  tryRenderMath,
  wrapMathInCodeSpans,
} from "@/lib/markdown-utils";
import { CitationGroup } from "./citation-group";
import { CitationLink } from "./citation-link";

// Whitespace characters pattern (excluding zero width joiner which can't be in character classes)
const WHITESPACE_CHARS =
  "(?:\\t| |\\u00A0|\\u1680|\\u180E|\\u2000|\\u2001|\\u2002|\\u2003|\\u2004|\\u2005|\\u2006|\\u2007|\\u2008|\\u2009|\\u200A|\\u202F|\\u205F|\\u3000|\\u200B|\\u200C|\\uFEFF|\\u200D)";

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

// Markdown component for llm-ui
const MarkdownBlockComponent: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;

  const processedMarkdown = useMemo(() => {
    const buffered = bufferIncompleteEntities(markdown);
    const parenthesesRemoved = removeParenthesesAroundItalics(buffered);
    const normalizedLatex = normalizeLatexDelimiters(parenthesesRemoved);
    // Wrap math in backtick code spans so markdown-to-jsx preserves LaTeX verbatim.
    // The MathCode override detects these and renders KaTeX.
    const mathEscaped = wrapMathInCodeSpans(normalizedLatex);
    const decoded = decodeMinimalEntities(mathEscaped);
    const unescaped = normalizeEscapedMarkdown(decoded);
    return convertCitationsToMarkdownLinks(unescaped);
  }, [markdown]);

  const overrides = useMemo(() => {
    return {
      em: { component: EmphasisOverride },
      a: { component: CitationLink },
      span: { component: SpanOverride },
      code: { component: MathCode },
    } as const;
  }, []);

  return (
    <div className="prose prose-sm sm:prose-base max-w-[74ch] prose-headings:font-semibold prose-p:leading-[1.75] prose-li:my-1.5 prose-ul:my-3 prose-ol:my-3 prose-hr:my-6 prose-a:underline-offset-2 hover:prose-a:underline prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-xl sm:prose-pre:rounded-[1.65rem] prose-pre:border prose-pre:border-input-border prose-pre:shadow-sm prose-pre:p-0 prose-pre:mt-2 prose-pre:mb-2 prose-pre:overflow-x-auto prose-blockquote:border-l-border prose-blockquote:text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p:first-of-type]:mt-0 tracking-tight">
      <Markdown
        options={{
          disableParsingRawHTML: true,
          overrides,
          renderRule(next, node) {
            // Inline code with math delimiters → render KaTeX directly
            if (
              node.type === RuleType.codeInline &&
              typeof node.text === "string"
            ) {
              const mathNode = tryRenderMath(node.text);
              if (mathNode) {
                return mathNode;
              }
            }
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
