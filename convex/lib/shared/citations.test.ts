import { describe, expect, test } from "bun:test";
import { extractCitations, extractMarkdownCitations } from "./citations";

describe("extractCitations", () => {
  test("returns undefined when no providerMetadata", () => {
    const result = extractCitations();
    expect(result).toBeUndefined();
  });

  test("returns undefined when providerMetadata is empty", () => {
    const result = extractCitations({});
    expect(result).toBeUndefined();
  });

  test("extracts Google Search Grounding citations", () => {
    const providerMetadata = {
      groundingMetadata: {
        groundingChunks: [
          {
            web: {
              uri: "https://example.com",
              title: "Example Site",
            },
            retrievedContent: {
              text: "Some content from the web",
            },
          },
        ],
      },
    };

    const result = extractCitations(providerMetadata);
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://example.com",
        title: "Example Site",
        cited_text: "Some content from the web",
      },
    ]);
  });

  test("returns undefined when Google grounding has no chunks", () => {
    const providerMetadata = {
      groundingMetadata: {
        groundingChunks: [],
      },
    };

    const result = extractCitations(providerMetadata);
    expect(result).toBeUndefined();
  });

  test("extracts OpenRouter web search citations", () => {
    const providerMetadata = {
      sources: [
        {
          url: "https://openrouter.ai/docs",
          title: "OpenRouter Documentation",
          snippet: "Learn about OpenRouter features",
        },
      ],
    };

    const result = extractCitations(providerMetadata);
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://openrouter.ai/docs",
        title: "OpenRouter Documentation",
        snippet: "Learn about OpenRouter features",
      },
    ]);
  });

  test("returns undefined when OpenRouter sources is empty array", () => {
    const providerMetadata = {
      sources: [],
    };

    const result = extractCitations(providerMetadata);
    expect(result).toBeUndefined();
  });

  test("handles missing properties in Google grounding", () => {
    const providerMetadata = {
      groundingMetadata: {
        groundingChunks: [
          {
            web: {},
            retrievedContent: {},
          },
        ],
      },
    };

    const result = extractCitations(providerMetadata);
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "",
        title: "",
        cited_text: "",
      },
    ]);
  });

  test("handles missing properties in OpenRouter sources", () => {
    const providerMetadata = {
      sources: [
        {
          url: undefined,
          title: undefined,
          snippet: undefined,
        },
      ],
    };

    const result = extractCitations(providerMetadata);
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "",
        title: "",
        snippet: "",
      },
    ]);
  });

  test("returns undefined for unknown metadata format", () => {
    const providerMetadata = {
      someOtherField: "value",
    };

    const result = extractCitations(providerMetadata);
    expect(result).toBeUndefined();
  });
});

describe("extractMarkdownCitations", () => {
  test("returns empty array for text without links", () => {
    const result = extractMarkdownCitations("This is plain text");
    expect(result).toEqual([]);
  });

  test("extracts single markdown link", () => {
    const result = extractMarkdownCitations("Check this [Example](https://example.com)");
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://example.com",
        title: "Example",
      },
    ]);
  });

  test("extracts multiple markdown links", () => {
    const result = extractMarkdownCitations(
      "See [Google](https://google.com) and [GitHub](https://github.com)"
    );
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://google.com",
        title: "Google",
      },
      {
        type: "url_citation",
        url: "https://github.com",
        title: "GitHub",
      },
    ]);
  });

  test("uses URL as title for numeric link text", () => {
    const result = extractMarkdownCitations("Reference [1](https://example.com)");
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://example.com",
        title: "https://example.com",
      },
    ]);
  });

  test("deduplicates URLs", () => {
    const result = extractMarkdownCitations(
      "[Link1](https://example.com) and [Link2](https://example.com)"
    );
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://example.com",
        title: "Link1",
      },
    ]);
  });

  test("ignores malformed links", () => {
    const result = extractMarkdownCitations("[incomplete link [broken]() extra text");
    expect(result).toEqual([]);
  });

  test("handles links with special characters", () => {
    const result = extractMarkdownCitations("[Test & More](https://example.com/path?q=test)");
    expect(result).toEqual([
      {
        type: "url_citation",
        url: "https://example.com/path?q=test",
        title: "Test & More",
      },
    ]);
  });
});
