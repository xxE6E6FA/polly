import type { WebSearchCitation } from "@/types";

/**
 * Extract citations from provider metadata
 */
export function extractCitations(
  providerMetadata?: Record<string, unknown>
): WebSearchCitation[] | undefined {
  if (!providerMetadata) {
    return undefined;
  }

  // Handle Google Search Grounding citations
  if ("groundingMetadata" in providerMetadata) {
    const grounding = providerMetadata.groundingMetadata as {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
        retrievedContent?: { text?: string };
      }>;
    };
    if (grounding?.groundingChunks) {
      const citations: WebSearchCitation[] = grounding.groundingChunks.map(
        chunk => {
          const web = chunk.web || {};
          return {
            type: "url_citation" as const,
            url: web.uri || "",
            title: web.title || "",
            citedText: chunk.retrievedContent?.text || "",
          };
        }
      );
      return citations.length > 0 ? citations : undefined;
    }
  }

  // Handle OpenRouter web search citations
  if (
    "sources" in providerMetadata &&
    Array.isArray(providerMetadata.sources)
  ) {
    const sources = providerMetadata.sources as Array<{
      url?: string;
      title?: string;
      snippet?: string;
    }>;
    const citations: WebSearchCitation[] = sources.map(source => ({
      type: "url_citation" as const,
      url: source.url || "",
      title: source.title || "",
      snippet: source.snippet || "",
    }));
    return citations.length > 0 ? citations : undefined;
  }

  return undefined;
}

/**
 * Extract citations from markdown-style links in text
 * Format: [text](url) or [number](url)
 */
export function extractMarkdownCitations(text: string): WebSearchCitation[] {
  const citations: WebSearchCitation[] = [];
  const seenUrls = new Set<string>();

  // Match markdown links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match = linkRegex.exec(text);

  while (match !== null) {
    const [_, linkText, url] = match;

    // Skip if we've already seen this URL
    if (seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);

    // Try to extract a title from the link text or use the URL
    const title = linkText.match(/^\d+$/) ? url : linkText;

    citations.push({
      type: "url_citation",
      url,
      title,
    });

    match = linkRegex.exec(text);
  }

  return citations;
}
