import { describe, expect, test } from "bun:test";
import type { WebSearchCitation } from "@/types";
import {
  extractCitations,
  extractMarkdownCitations,
} from "./browser-citations";

describe("browser-citations.extractCitations", () => {
  test("handles undefined metadata", () => {
    expect(extractCitations(undefined)).toBeUndefined();
  });

  test("extracts Google grounding citations", () => {
    const meta: Record<string, unknown> = {
      groundingMetadata: {
        groundingChunks: [
          {
            web: { uri: "https://a.com", title: "A" },
            retrievedContent: { text: "Snippet A" },
          },
          {
            web: { uri: "https://b.com", title: "B" },
          },
        ],
      },
    };
    const res = extractCitations(meta);
    expect(res).toBeDefined();
    const r = res as WebSearchCitation[];
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ url: "https://a.com", title: "A" });
    expect(r[0]).toHaveProperty("citedText", "Snippet A");
  });

  test("extracts OpenRouter sources", () => {
    const meta: Record<string, unknown> = {
      sources: [
        { url: "https://x.com", title: "X", snippet: "sx" },
        { url: "https://y.com", title: "Y" },
      ],
    };
    const res = extractCitations(meta);
    expect(res).toBeDefined();
    const r = res as WebSearchCitation[];
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ url: "https://y.com", title: "Y" });
  });
});

describe("browser-citations.extractMarkdownCitations", () => {
  test("extracts markdown links and deduplicates", () => {
    const text =
      "See [Intro](https://a.com) and [1](https://b.com). Again [Intro](https://a.com).";
    const res = extractMarkdownCitations(text);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ title: "Intro", url: "https://a.com" });
    // numeric title becomes URL
    expect(res[1]).toMatchObject({
      title: "https://b.com",
      url: "https://b.com",
    });
  });
});
