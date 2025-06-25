import React, { useMemo } from "react";
import { type LLMOutputComponent } from "@llm-ui/react";
import { useMessageId } from "./streaming-markdown";
import katex from "katex";
import Markdown from "markdown-to-jsx";

// Helper function to generate heading ID (same logic as in outline)
const generateHeadingId = (messageId: string, headingText: string): string => {
  const cleanText = headingText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${messageId}-heading-${cleanText}`;
};

// Math regex patterns
const INLINE_MATH_REGEX = /\$([^$\n]+)\$/g;
const BLOCK_MATH_REGEX = /\$\$([^$]+)\$\$/g;

// Render math with KaTeX
const renderMath = (math: string, displayMode: boolean) => {
  try {
    return katex.renderToString(math, {
      displayMode,
      throwOnError: false,
      output: "html",
    });
  } catch (e) {
    console.error("Math rendering error:", e);
    return `<span class="text-red-500">Math Error: ${math}</span>`;
  }
};

// Memoized heading component factory
const createHeadingComponent = (level: number) => {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

  const HeadingComponent = React.memo(
    ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      // Get message ID from context
      const messageId = useMessageId() || "";

      // Get text content for ID generation
      const textContent = useMemo(
        () => React.Children.toArray(children).join("").toString(),
        [children]
      );
      const headingId = useMemo(
        () => generateHeadingId(messageId, textContent),
        [messageId, textContent]
      );

      return React.createElement(
        Tag,
        {
          ...props,
          id: headingId,
          className: `scroll-mt-20 ${props.className || ""}`.trim(),
        },
        children
      );
    }
  );

  HeadingComponent.displayName = `Heading${level}`;
  return HeadingComponent;
};

// Create heading components once
const headingComponents = {
  h1: createHeadingComponent(1),
  h2: createHeadingComponent(2),
  h3: createHeadingComponent(3),
  h4: createHeadingComponent(4),
  h5: createHeadingComponent(5),
  h6: createHeadingComponent(6),
};

// Memoized inline code component
const InlineCode = React.memo(
  ({
    children,
    className,
    ...rest
  }: React.HTMLAttributes<HTMLElement> & { className?: string }) => {
    // Only handle true inline code (no language class)
    const isInline = !className || !className.startsWith("lang-");

    if (isInline) {
      return (
        <code
          className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
          {...rest}
        >
          {children}
        </code>
      );
    }

    // Block code is handled by llm-ui's code block detection
    // Just render plain for fallback (shouldn't happen in practice)
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }
);
InlineCode.displayName = "InlineCode";

// Simplified pre component - no code block handling needed
// Code blocks are caught by llm-ui before they reach markdown
const PreComponent = React.memo(
  ({ children, ...rest }: React.HTMLAttributes<HTMLPreElement>) => {
    // This should rarely be called as code blocks are extracted by llm-ui
    return (
      <pre className="overflow-x-auto p-4 rounded bg-muted" {...rest}>
        {children}
      </pre>
    );
  }
);
PreComponent.displayName = "PreComponent";

// Math component
const MathComponent = React.memo(
  ({ math, display }: { math: string; display: boolean }) => {
    const html = useMemo(() => renderMath(math, display), [math, display]);

    return (
      <span
        className={display ? "katex-display" : "katex"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
);
MathComponent.displayName = "MathComponent";

// Markdown component for llm-ui
export const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => {
  const markdown = blockMatch.output;

  // Pre-process markdown to handle math
  const processedMarkdown = useMemo(() => {
    let processed = markdown;

    // Replace block math first (to avoid inline math matching inside block math)
    processed = processed.replace(BLOCK_MATH_REGEX, (_match, math) => {
      return `<MathBlock>${math.trim()}</MathBlock>`;
    });

    // Replace inline math
    processed = processed.replace(INLINE_MATH_REGEX, (_match, math) => {
      return `<MathInline>${math.trim()}</MathInline>`;
    });

    return processed;
  }, [markdown]);

  // Memoize the options object
  const options = useMemo(
    () => ({
      forceBlock: true,
      overrides: {
        // Custom heading components with proper IDs
        ...headingComponents,
        // Customize inline code only
        code: InlineCode,
        // Simple pre fallback (code blocks handled by llm-ui)
        pre: PreComponent,
        // Custom math components
        MathBlock: {
          component: ({ children }: { children: string }) => (
            <MathComponent math={children} display={true} />
          ),
        },
        MathInline: {
          component: ({ children }: { children: string }) => (
            <MathComponent math={children} display={false} />
          ),
        },
        // GFM-style tables
        table: {
          component: ({
            children,
            ...props
          }: React.HTMLAttributes<HTMLTableElement>) => (
            <div className="overflow-x-auto my-4">
              <table className="border-collapse" {...props}>
                {children}
              </table>
            </div>
          ),
        },
        // Strikethrough support
        del: {
          component: ({
            children,
            ...props
          }: React.HTMLAttributes<HTMLElement>) => (
            <del className="line-through" {...props}>
              {children}
            </del>
          ),
        },
        // Task list support
        input: {
          component: ({
            type,
            checked,
            ...props
          }: React.InputHTMLAttributes<HTMLInputElement>) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  className="mr-2"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
        },
      },
    }),
    []
  );

  return (
    <div className="prose prose-base max-w-none dark:prose-invert prose-p:leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 katex-container">
      <Markdown options={options}>{processedMarkdown}</Markdown>
    </div>
  );
};
