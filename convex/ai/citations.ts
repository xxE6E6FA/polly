import {
  Citation,
  WebSource,
  OpenRouterCitation,
  OpenRouterAnnotation,
  GoogleGroundingChunk,
  ProviderMetadata,
} from "./types";

// Citation extractor factory
const citationExtractors = {
  sources: (sources: WebSource[]): Citation[] => {
    return sources
      .filter(source => source.url)
      .map(source => ({
        type: "url_citation" as const,
        url: source.url,
        title: source.title || "Web Source",
        snippet: source.snippet || source.description || "",
      }));
  },

  openrouter: (citations: OpenRouterCitation[]): Citation[] => {
    return citations.map(c => ({
      type: "url_citation" as const,
      url: c.url,
      title: c.title || "Web Source",
      cited_text: c.text,
      snippet: c.snippet,
    }));
  },

  openrouterAnnotations: (annotations: OpenRouterAnnotation[]): Citation[] => {
    // Handle OpenRouter's web search annotations format
    return annotations
      .filter(
        annotation =>
          annotation.type === "url_citation" && annotation.url_citation
      )
      .map(annotation => {
        const citation = annotation.url_citation!;
        return {
          type: "url_citation" as const,
          url: citation.url,
          title: citation.title || "Web Source",
          snippet: citation.content || "",
          // The cited_text can be extracted from the message content using start/end indices
          cited_text: citation.content,
        };
      });
  },

  google: (chunks: GoogleGroundingChunk[]): Citation[] => {
    return chunks.map(chunk => ({
      type: "url_citation" as const,
      url: chunk.web?.uri || "",
      title: chunk.web?.title || "Web Source",
      snippet: chunk.content,
    }));
  },
};

// Extract citations from provider metadata and/or sources
export const extractCitations = (
  providerMetadata?: ProviderMetadata,
  sources?: WebSource[]
): Citation[] | undefined => {
  const citations: Citation[] = [];

  // Extract from different sources
  if (sources && Array.isArray(sources)) {
    citations.push(...citationExtractors.sources(sources));
  }

  if (providerMetadata?.openrouter?.citations) {
    citations.push(
      ...citationExtractors.openrouter(providerMetadata.openrouter.citations)
    );
  }

  // Check for OpenRouter annotations in provider metadata
  if (providerMetadata?.openrouter?.annotations) {
    citations.push(
      ...citationExtractors.openrouterAnnotations(
        providerMetadata.openrouter.annotations
      )
    );
  }

  if (providerMetadata?.google?.groundingChunks) {
    citations.push(
      ...citationExtractors.google(providerMetadata.google.groundingChunks)
    );
  }

  return citations.length > 0 ? citations : undefined;
};

// Extract citations from markdown links in text
export const extractMarkdownCitations = (text: string): Citation[] => {
  const citations: Citation[] = [];
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [_, linkText, url] = match;

    // Skip if it's not a valid URL
    try {
      new URL(url);
    } catch {
      continue;
    }

    // Extract domain name for the title if the link text is a domain
    const domain = linkText
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    citations.push({
      type: "url_citation" as const,
      url: url,
      title: linkText || domain || "Web Source",
      // We don't have snippet data from markdown links
      snippet: "",
    });
  }

  return citations;
};
