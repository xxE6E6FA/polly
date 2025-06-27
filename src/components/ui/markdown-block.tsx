import React, { useMemo } from "react";

import { type LLMOutputComponent } from "@llm-ui/react";
import Markdown from "markdown-to-jsx";

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

// Markdown component for llm-ui - simplified to match their examples
export const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;
  const messageId = useMessageId();

  // Buffer incomplete HTML entities during streaming
  const processedMarkdown = useMemo(() => {
    return bufferIncompleteEntities(markdown);
  }, [markdown]);

  // Create heading override functions
  const createHeadingOverride = (level: 1 | 2 | 3 | 4 | 5 | 6) => ({
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

  return (
    <div className="prose prose-base max-w-none dark:prose-invert prose-p:leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        options={{
          // Use span wrapper to avoid block-level parsing issues
          wrapper: React.Fragment,
          forceBlock: true,
          // Disable HTML parsing to prevent entity issues during streaming
          disableParsingRawHTML: true,
          // Handle numeric entities that might appear during streaming
          namedCodesToUnicode: NUMERIC_ENTITIES,
          overrides: {
            // Add heading overrides to include IDs
            h1: createHeadingOverride(1),
            h2: createHeadingOverride(2),
            h3: createHeadingOverride(3),
            h4: createHeadingOverride(4),
            h5: createHeadingOverride(5),
            h6: createHeadingOverride(6),
            // Basic overrides for consistent styling
            code: {
              component: ({
                children,
                className,
                ...props
              }: React.HTMLAttributes<HTMLElement> & {
                className?: string;
              }) => {
                // Only style inline code (block code is handled by llm-ui)
                const isInline = !className || !className.startsWith("lang-");
                if (isInline) {
                  return (
                    <code
                      className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            },
          },
        }}
      >
        {processedMarkdown}
      </Markdown>
    </div>
  );
};
