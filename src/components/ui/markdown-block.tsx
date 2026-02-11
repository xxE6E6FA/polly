import type { LLMOutputComponent } from "@llm-ui/react";
import Markdown, { RuleType } from "markdown-to-jsx/react";
import React, { useMemo } from "react";
import {
  applyHardLineBreaks,
  bufferIncompleteEntities,
  convertCitationsToMarkdownLinks,
  decodeMinimalEntities,
  normalizeEscapedMarkdown,
  normalizeLatexDelimiters,
  removeParenthesesAroundItalics,
  renderTextWithMathAndCitations,
} from "@/lib/markdown-utils";
import { generateHeadingId } from "@/lib/utils";
import { CitationGroup } from "./citation-group";
import { CitationLink } from "./citation-link";
import { useMessageId } from "./streaming-markdown";

// Whitespace characters pattern (excluding zero width joiner which can't be in character classes)
const WHITESPACE_CHARS =
  "(?:\\t| |\\u00A0|\\u1680|\\u180E|\\u2000|\\u2001|\\u2002|\\u2003|\\u2004|\\u2005|\\u2006|\\u2007|\\u2008|\\u2009|\\u200A|\\u202F|\\u205F|\\u3000|\\u200B|\\u200C|\\uFEFF|\\u200D)";

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
    <div className="prose prose-sm sm:prose-base max-w-[74ch] prose-headings:font-semibold prose-p:leading-[1.75] prose-li:my-1.5 prose-ul:my-3 prose-ol:my-3 prose-hr:my-6 prose-a:underline-offset-2 hover:prose-a:underline prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-xl sm:prose-pre:rounded-[1.65rem] prose-pre:border prose-pre:border-input-border prose-pre:shadow-sm prose-pre:p-0 prose-pre:mt-2 prose-pre:mb-2 prose-pre:overflow-x-auto prose-blockquote:border-l-border prose-blockquote:text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p:first-of-type]:mt-0 tracking-tight">
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
