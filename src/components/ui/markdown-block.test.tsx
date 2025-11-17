import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import Markdown from "markdown-to-jsx";
import type React from "react";

describe("Citation Link Conversion", () => {
  it("should parse markdown links with hash URLs", () => {
    const markdown = "[1,2](#cite-group-1-2)";

    const TestComponent = () => (
      <Markdown
        options={{
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => (
                <a
                  {...props}
                  href={href}
                  data-testid="citation-link"
                  className="test-citation"
                >
                  {children}
                </a>
              ),
            },
          },
        }}
      >
        {markdown}
      </Markdown>
    );

    render(<TestComponent />);

    const link = screen.getByTestId("citation-link");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("#cite-group-1-2");
    expect(link.textContent).toBe("1,2");
  });

  it("should parse regular links", () => {
    const markdown = "[Google](https://google.com)";

    const TestComponent = () => <Markdown>{markdown}</Markdown>;

    render(<TestComponent />);

    const link = screen.getByRole("link");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("https://google.com");
    expect(link.textContent).toBe("Google");
  });

  it("should handle multiple citation links in text", () => {
    const markdown = "This is text [1](#cite-1) and [2](#cite-2) more text";

    const TestComponent = () => (
      <Markdown
        options={{
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => (
                <a {...props} href={href} className="citation-link">
                  {children}
                </a>
              ),
            },
          },
        }}
      >
        {markdown}
      </Markdown>
    );

    render(<TestComponent />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
    expect(links[0].getAttribute("href")).toBe("#cite-1");
    expect(links[0].textContent).toBe("1");
    expect(links[1].getAttribute("href")).toBe("#cite-2");
    expect(links[1].textContent).toBe("2");
  });

  it("should not double-convert already converted citations", () => {
    const alreadyConverted = "Text [1](#cite-1) more text";
    const raw = "Text [1] more text";

    // The conversion function should be idempotent
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    expect(convertCitationsToMarkdownLinks(alreadyConverted)).toBe(
      alreadyConverted
    );
    expect(convertCitationsToMarkdownLinks(raw)).toBe(alreadyConverted);
  });

  it("should convert consecutive citations to grouped links", () => {
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    expect(convertCitationsToMarkdownLinks("Text [1][2][3] more")).toBe(
      "Text [1,2,3](#cite-group-1-2-3) more"
    );
    expect(convertCitationsToMarkdownLinks("Text [1] and [2] more")).toBe(
      "Text [1](#cite-1) and [2](#cite-2) more"
    );
  });

  it("should handle raw citations when parsed by markdown-to-jsx", () => {
    // This tests what happens when raw citations like [1][2] are passed to the markdown parser
    // WITHOUT being converted first - they should be treated as reference links or plain text
    const rawCitations = "Text with citations [1][2] here";

    const TestComponent = () => (
      <Markdown
        options={{
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => (
                <a
                  {...props}
                  href={href}
                  className="citation-link"
                  data-testid="parsed-link"
                >
                  {children}
                </a>
              ),
            },
          },
        }}
      >
        {rawCitations}
      </Markdown>
    );

    const { container } = render(<TestComponent />);

    // Raw [1][2] patterns are NOT parsed as links by markdown-to-jsx
    // They're treated as reference-style link syntax, which without definitions renders as plain text
    const links = container.querySelectorAll('[data-testid="parsed-link"]');
    expect(links.length).toBe(0); // No links should be created from raw [1][2]

    // The text should remain as-is
    expect(container.textContent).toContain("[1][2]");
  });

  it("should parse citations after conversion", () => {
    // This tests the full pipeline: convert THEN parse
    const rawCitations = "Text with citations [1][2] here";

    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    const converted = convertCitationsToMarkdownLinks(rawCitations);
    expect(converted).toBe("Text with citations [1,2](#cite-group-1-2) here");

    const TestComponent = () => (
      <Markdown
        options={{
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => (
                <a
                  {...props}
                  href={href}
                  className="citation-link"
                  data-testid="parsed-link"
                >
                  {children}
                </a>
              ),
            },
          },
        }}
      >
        {converted}
      </Markdown>
    );

    const { container } = render(<TestComponent />);

    // After conversion, it should be parsed as a proper link
    const links = container.querySelectorAll('[data-testid="parsed-link"]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("#cite-group-1-2");
    expect(links[0].textContent).toBe("1,2");
  });

  it("should handle the full citation pipeline from streaming to rendering", () => {
    // This simulates the actual flow in the app:
    // 1. AI outputs raw text with citations like [1][2]
    // 2. convertCitationsToMarkdownLinks processes it
    // 3. Markdown parser creates link nodes
    // 4. CitationLink component renders them

    const rawAIOutput =
      "Here is some information about web search [1][2] and more details [3].";

    // Step 1: Convert citations to markdown links (this is what MarkdownBlock does)
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    const converted = convertCitationsToMarkdownLinks(rawAIOutput);
    expect(converted).toBe(
      "Here is some information about web search [1,2](#cite-group-1-2) and more details [3](#cite-3)."
    );

    // Step 2: Render with markdown parser
    const TestComponent = () => (
      <Markdown
        options={{
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"a">) => (
                <a
                  {...props}
                  href={href}
                  className="citation-link"
                  data-testid="citation-link"
                >
                  {children}
                </a>
              ),
            },
          },
        }}
      >
        {converted}
      </Markdown>
    );

    const { container } = render(<TestComponent />);

    // Verify links are created correctly
    const links = container.querySelectorAll('[data-testid="citation-link"]');
    expect(links.length).toBe(2);

    // First link is the grouped citation
    expect(links[0].getAttribute("href")).toBe("#cite-group-1-2");
    expect(links[0].textContent).toBe("1,2");

    // Second link is a single citation
    expect(links[1].getAttribute("href")).toBe("#cite-3");
    expect(links[1].textContent).toBe("3");

    // Verify the full text
    expect(container.textContent).toBe(
      "Here is some information about web search 1,2 and more details 3."
    );
  });

  it("should handle edge case: citations at the start and end of text", () => {
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    expect(convertCitationsToMarkdownLinks("[1] Text [2][3]")).toBe(
      "[1](#cite-1) Text [2,3](#cite-group-2-3)"
    );
    expect(convertCitationsToMarkdownLinks("[1][2][3][4][5]")).toBe(
      "[1,2,3,4,5](#cite-group-1-2-3-4-5)"
    );
  });

  it("should preserve already-converted citations in mixed content", () => {
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    // This can happen during streaming when some parts are already converted
    const mixed = "Already [1](#cite-1) and raw [2] and [3][4]";
    const result = convertCitationsToMarkdownLinks(mixed);

    // Should only convert the raw citations
    expect(result).toBe(
      "Already [1](#cite-1) and raw [2](#cite-2) and [3,4](#cite-group-3-4)"
    );
  });

  it("should handle escaped brackets in citations", () => {
    const convertCitationsToMarkdownLinks = (text: string): string => {
      if (!text) {
        return text;
      }

      const normalized = text.replace(/((?:\[\d+\])+)(?!\(#cite-)/g, match => {
        const numbers = Array.from(match.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
        if (numbers.length === 1) {
          return `[${numbers[0]}](#cite-${numbers[0]})`;
        }
        return `[${numbers.join(",")}](#cite-group-${numbers.join("-")})`;
      });

      return normalized;
    };

    // Simulate the normalizeEscapedMarkdown step that unescapes brackets
    const normalizeEscapedMarkdown = (text: string): string => {
      return text.replace(/\\(\[|\])/g, "$1");
    };

    const escapedInput = "Text with escaped \\[1\\]\\[2\\] citations";
    const normalized = normalizeEscapedMarkdown(escapedInput);
    const converted = convertCitationsToMarkdownLinks(normalized);

    expect(normalized).toBe("Text with escaped [1][2] citations");
    expect(converted).toBe(
      "Text with escaped [1,2](#cite-group-1-2) citations"
    );
  });
});
