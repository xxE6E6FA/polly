import { describe, test, expect } from "bun:test";
import { extractCitations, extractMarkdownCitations } from "./citations";

describe("shared/citations", () => {
  test("extracts Google grounding citations", () => {
    const meta = {
      groundingMetadata: {
        groundingChunks: [
          {
            web: { uri: "https://a.com", title: "A" },
            retrievedContent: { text: "snippet A" },
          },
          {
            web: { uri: "https://b.com" },
          },
        ],
      },
    } as any;

    expect(extractCitations(meta)).toEqual([
      {
        type: "url_citation",
        url: "https://a.com",
        title: "A",
        cited_text: "snippet A",
      },
      {
        type: "url_citation",
        url: "https://b.com",
        title: "",
        cited_text: "",
      },
    ]);

    expect(extractCitations({ groundingMetadata: { groundingChunks: [] } } as any)).toBe(
      undefined
    );
  });

  test("extracts OpenRouter sources citations", () => {
    const meta = {
      sources: [
        { url: "https://x.com", title: "X", snippet: "s1" },
        { url: "https://y.com" },
      ],
    } as any;

    expect(extractCitations(meta)).toEqual([
      { type: "url_citation", url: "https://x.com", title: "X", snippet: "s1" },
      { type: "url_citation", url: "https://y.com", title: "", snippet: "" },
    ]);
  });

  test("extracts markdown-style citations and dedupes URLs", () => {
    const text =
      "See [1](https://a.com) and [Article](https://a.com) and [Other](https://b.com)";
    expect(extractMarkdownCitations(text)).toEqual([
      { type: "url_citation", url: "https://a.com", title: "https://a.com" },
      { type: "url_citation", url: "https://b.com", title: "Other" },
    ]);
  });
});

